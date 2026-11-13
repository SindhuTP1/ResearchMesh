import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useLazyQuery } from '@apollo/client/react';
import {
  SEND_CONNECTION_REQUEST, RESPOND_CONNECTION, WITHDRAW_CONNECTION, OPEN_DIRECT, INVITE_TO_PROJECT, MY_OPEN_PROJECTS,
} from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast, errorText, confetti } from './ui.jsx';

const REFRESH = ['ConnectionsPage', 'UserProfile'];

/** Connect / Requested / Accept / Connected, driven by user.connectionStatus. */
export function ConnectButton({ user, size = 'sm' }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const [send, s1] = useMutation(SEND_CONNECTION_REQUEST, { refetchQueries: REFRESH });
  const [respond, s2] = useMutation(RESPOND_CONNECTION, { refetchQueries: REFRESH });
  const [withdraw, s3] = useMutation(WITHDRAW_CONNECTION, { refetchQueries: REFRESH });
  const busy = s1.loading || s2.loading || s3.loading;
  const cls = `btn btn-${size}`;
  if (!me || me.role === 'ADMIN' || user.role === 'ADMIN') return null;
  const fail = (title) => (e) => toast({ kind: 'error', title, body: errorText(e) });

  switch (user.connectionStatus) {
    case 'SELF':
      return null;
    case 'CONNECTED':
      return <span className="status accepted">Connected</span>;
    case 'OUTGOING':
      return (
        <span className="row" style={{ gap: 6 }}>
          <span className="status pending">Requested</span>
          {user.pendingConnectionRequestId && (
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => withdraw({ variables: { id: user.pendingConnectionRequestId } }).catch(fail('Not withdrawn'))}>Withdraw</button>
          )}
        </span>
      );
    case 'INCOMING':
      return (
        <span className="row" style={{ gap: 6 }}>
          <button className={`${cls} btn-primary`} disabled={busy} onClick={async () => {
            try {
              await respond({ variables: { id: user.pendingConnectionRequestId, accept: true } });
              confetti();
              toast({ kind: 'ok', title: 'Connected', body: `You can now message ${user.name}.` });
            } catch (e) { fail('Not accepted')(e); }
          }}>Accept request</button>
          <button className={`${cls} btn-ghost`} disabled={busy} onClick={() => respond({ variables: { id: user.pendingConnectionRequestId, accept: false } }).catch(fail('Not declined'))}>Decline</button>
        </span>
      );
    default:
      return (
        <button className={cls} disabled={busy} onClick={async () => {
          try {
            await send({ variables: { userId: user.id } });
            toast({ kind: 'ok', title: 'Request sent', body: `${user.name} will be notified. Chat opens once they accept.` });
          } catch (e) { fail('Request not sent')(e); }
        }}>Connect</button>
      );
  }
}

/** Opens (or creates) the 1:1 chat and goes to it. */
export function MessageButton({ user, size = 'sm', primary = false }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, { loading }] = useMutation(OPEN_DIRECT);
  return (
    <button className={`btn btn-${size} ${primary ? 'btn-primary' : ''}`} disabled={loading} onClick={async () => {
      try {
        const { data } = await open({ variables: { userId: user.id } });
        navigate(`/messages/${data.openDirectConversation.id}`);
      } catch (e) { toast({ kind: 'error', title: "Can't message yet", body: errorText(e) }); }
    }}>Message</button>
  );
}

/** Invite someone to one of your open projects (a "team" for students). */
export function InviteButton({ user }) {
  const toast = useToast();
  const [openMenu, setOpenMenu] = useState(false);
  const [load, { data, loading }] = useLazyQuery(MY_OPEN_PROJECTS, { fetchPolicy: 'network-only' });
  const [invite, { loading: inviting }] = useMutation(INVITE_TO_PROJECT);
  const projects = (data?.projects ?? []).filter((p) => p.seatsLeft > 0 && !p.members.some((m) => m.id === user.id));

  return (
    <span className="menu-wrap">
      <button className="btn btn-sm" aria-expanded={openMenu} onClick={() => { setOpenMenu(!openMenu); if (!openMenu) load(); }}>Invite to team ▾</button>
      {openMenu && (
        <div className="menu" role="menu">
          {loading && <div className="faint">Loading…</div>}
          {!loading && projects.length === 0 && <div className="faint">You have no open project with free seats. Start a team or post a project first.</div>}
          {projects.map((p) => (
            <button key={p.id} role="menuitem" disabled={inviting} onClick={async () => {
              try {
                await invite({ variables: { projectId: p.id, userId: user.id } });
                toast({ kind: 'ok', title: 'Invite sent', body: `${user.name} can accept it from their requests.` });
                setOpenMenu(false);
              } catch (e) { toast({ kind: 'error', title: 'Invite not sent', body: errorText(e) }); }
            }}>{p.title} <span className="faint">{p.seatsLeft} free</span></button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Connect + Message (+ Invite) — the standard action cluster on a person. */
export function PersonActions({ user, invite = false }) {
  const { user: me } = useAuth();
  if (!me || user.id === me.id || me.role === 'ADMIN') return null;
  return (
    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
      {user.connectionStatus === 'CONNECTED' ? <MessageButton user={user} /> : <ConnectButton user={user} />}
      {invite && <InviteButton user={user} />}
    </div>
  );
}
