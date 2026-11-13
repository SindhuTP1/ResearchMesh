import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { CONNECTIONS_PAGE, RESPOND_CONNECTION, WITHDRAW_CONNECTION, REMOVE_CONNECTION } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PersonRow from '../components/PersonRow.jsx';
import { MessageButton } from '../components/social.jsx';
import { Loading, ErrorNote, Empty, useToast, errorText, timeAgo, confetti } from '../components/ui.jsx';

export default function Connections() {
  const { isStudent } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('connections');
  const [q, setQ] = useState('');
  const { data, loading, error } = useQuery(CONNECTIONS_PAGE, { fetchPolicy: 'cache-and-network' });
  const opts = { refetchQueries: [CONNECTIONS_PAGE] };
  const [respond, { loading: responding }] = useMutation(RESPOND_CONNECTION, opts);
  const [withdraw] = useMutation(WITHDRAW_CONNECTION, opts);
  const [remove] = useMutation(REMOVE_CONNECTION, opts);
  const fail = (title) => (e) => toast({ kind: 'error', title, body: errorText(e) });

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote error={error} />;
  const needle = q.trim().toLowerCase();
  const people = data.myConnections.filter((u) => !needle || u.name.toLowerCase().includes(needle));
  const tabs = [['connections', `Connections (${data.myConnections.length})`], ['incoming', `Requests (${data.incoming.length})`], ['outgoing', `Sent (${data.outgoing.length})`]];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Connections</h1>
          <p className="muted">
            Connected people can message and video-call each other. When a join request or invite is accepted, the two people are connected automatically.
            {isStudent && <> Looking for people? <Link to="/teammates">Find teammates</Link>.</>}
          </p>
        </div>
      </div>
      <div className="row" role="tablist" style={{ marginBottom: 14 }}>
        {tabs.map(([v, l]) => (
          <button key={v} role="tab" aria-selected={tab === v} className={`btn btn-sm ${tab === v ? 'btn-primary' : ''}`} onClick={() => setTab(v)}>
            {l}{v === 'incoming' && data.incoming.length > 0 && tab !== v && <span className="badge-live" style={{ marginLeft: 6 }}>{data.incoming.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'connections' && (
        <>
          {data.myConnections.length > 6 && <input style={{ maxWidth: 260, marginBottom: 10 }} placeholder="Search connections" aria-label="Search connections" value={q} onChange={(e) => setQ(e.target.value)} />}
          {data.myConnections.length === 0 ? (
            <Empty><p>No connections yet.</p><p>{isStudent ? <>Find people with the same interests on <Link to="/teammates">Find teammates</Link>, or join a project.</> : <>Accept a student's join request or invite students to your projects.</>}</p></Empty>
          ) : (
            <div className="people">
              {people.map((u) => (
                <PersonRow key={u.id} user={u} side={
                  <div className="row" style={{ gap: 6 }}>
                    <MessageButton user={u} primary />
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      if (window.confirm(`Remove ${u.name} from your connections? You won't be able to message them unless you work together.`)) remove({ variables: { userId: u.id } }).catch(fail('Not removed'));
                    }}>Remove</button>
                  </div>
                } />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'incoming' && (data.incoming.length === 0 ? <Empty><p>No pending requests.</p></Empty> : (
        <div className="people">
          {data.incoming.map((r) => (
            <PersonRow key={r.id} user={r.from} side={
              <>
                {r.message && <blockquote className="quote">“{r.message}”</blockquote>}
                <span className="faint">{timeAgo(r.createdAt)}</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-primary btn-sm" disabled={responding} onClick={() => respond({ variables: { id: r.id, accept: true } }).then(() => { confetti(); toast({ kind: 'ok', title: 'Connected', body: `You can now message ${r.from.name}.` }); }).catch(fail('Not accepted'))}>Accept</button>
                  <button className="btn btn-sm" disabled={responding} onClick={() => respond({ variables: { id: r.id, accept: false } }).catch(fail('Not declined'))}>Decline</button>
                </div>
              </>
            } />
          ))}
        </div>
      ))}

      {tab === 'outgoing' && (data.outgoing.length === 0 ? <Empty><p>No requests waiting for an answer.</p></Empty> : (
        <div className="people">
          {data.outgoing.map((r) => (
            <PersonRow key={r.id} user={r.to} side={
              <>
                <span className="faint">Sent {timeAgo(r.createdAt)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => withdraw({ variables: { id: r.id } }).catch(fail('Not withdrawn'))}>Withdraw</button>
              </>
            } />
          ))}
        </div>
      ))}
    </>
  );
}
