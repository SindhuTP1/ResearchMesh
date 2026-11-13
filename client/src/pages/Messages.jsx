import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import {
  CONVERSATIONS, CHAT_START, OPEN_DIRECT, CREATE_GROUP, OPEN_PROJECT_CHAT, OPEN_LAB_CHAT, ADD_MEMBERS, REMOVE_MEMBER,
  LEAVE_CONVERSATION, UPDATE_CONVERSATION,
} from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import ChatThread, { time } from './chat/ChatThread.jsx';
import { pushSupported, currentSubscription, enablePush, disablePush } from '../push.js';
import { Avatar, Loading, ErrorNote, Empty, UserLink, useToast, errorText } from '../components/ui.jsx';

/* ------------------------------- helpers ------------------------------- */
const shortWhen = (iso) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? time(iso) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const first = (name = '') => name.replace(/^Dr\.\s*/, 'Dr. ').split(/\s+/).slice(0, name.startsWith('Dr.') ? 2 : 1).join(' ');

function ConvIcon({ c }) {
  if (c.type === 'DIRECT' && c.otherUser) {
    return (
      <span className="avatar-wrap">
        <Avatar user={c.otherUser} />
        {c.otherUser.isOnline && <span className="online-dot" title="Online" />}
      </span>
    );
  }
  return <div className="avatar group" aria-hidden="true">{c.project ? '◆' : c.lab ? '⌂' : '#'}</div>;
}

/** Desktop / push notifications on or off for this browser. */
function NotifyToggle() {
  const client = useApolloClient();
  const toast = useToast();
  const [state, setState] = useState('checking');
  useEffect(() => {
    if (!pushSupported()) { setState('unsupported'); return; }
    currentSubscription().then((sub) => setState(sub && Notification.permission === 'granted' ? 'on' : 'off'));
  }, []);
  if (state === 'unsupported' || state === 'checking') return null;
  return (
    <button
      className={`icon-btn ${state === 'on' ? 'on' : ''}`}
      title={state === 'on' ? 'Notifications are on — click to turn off' : 'Get notified about messages and calls even when ResearchMesh is closed'}
      aria-label={state === 'on' ? 'Turn notifications off' : 'Turn notifications on'}
      onClick={async () => {
        if (state === 'on') { await disablePush(client); setState('off'); toast({ title: 'Notifications off', body: 'You will only see messages while ResearchMesh is open.' }); return; }
        const r = await enablePush(client);
        if (r === 'enabled') { setState('on'); toast({ kind: 'ok', title: 'Notifications on', body: 'You will be notified about messages and calls even when this tab is closed.' }); }
        else toast({ kind: 'error', title: 'Notifications not enabled', body: r === 'denied' ? 'Your browser blocked them. Allow notifications for this site in the address bar.' : 'Push is not available in this browser.' });
      }}
    >{state === 'on' ? '🔔' : '🔕'}</button>
  );
}

/* -------------------------------- inbox -------------------------------- */
function Inbox({ activeId, onNew }) {
  const { user } = useAuth();
  const { data, loading, error } = useQuery(CONVERSATIONS, { fetchPolicy: 'cache-and-network' });
  const [q, setQ] = useState('');
  const list = (data?.conversations ?? []).filter((c) => !q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <aside className="inbox">
      <div className="inbox-head">
        <h2>Messages</h2>
        <div className="row" style={{ gap: 6 }}>
          <NotifyToggle />
          <button className="btn btn-primary btn-sm" onClick={onNew}>New chat</button>
        </div>
      </div>
      <input className="inbox-search" placeholder="Search chats" aria-label="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorNote error={error} />
      {loading && !data && <Loading />}
      {data && data.conversations.length === 0 && (
        <p className="faint" style={{ padding: 14 }}>No chats yet. Connect with someone, join a project, or start a group.</p>
      )}
      <nav aria-label="Conversations">
        {list.map((c) => {
          const m = c.lastMessage;
          const content = !m ? '' : m.isDeleted ? '🚫 deleted' : m.body || (m.attachment ? `${m.attachment.isImage ? '🖼️ Photo' : `📎 ${m.attachment.name}`}` : '');
          const preview = !m ? 'No messages yet' : m.kind === 'SYSTEM' ? m.body : `${m.sender?.id === user.id ? 'You' : c.type === 'GROUP' ? first(m.sender?.name) : ''}${m.sender?.id === user.id || c.type === 'GROUP' ? ': ' : ''}${content}`;
          return (
            <Link key={c.id} to={`/messages/${c.id}`} className={`conv ${c.id === activeId ? 'active' : ''} ${c.unreadCount ? 'unread' : ''}`}>
              <ConvIcon c={c} />
              <div className="conv-main">
                <div className="spread"><span className="conv-title">{c.title}</span><span className="faint">{shortWhen(c.lastMessageAt)}</span></div>
                <div className="spread">
                  <span className="conv-preview">{preview}</span>
                  {c.unreadCount > 0 && <span className="badge-live">{c.unreadCount}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/* ------------------------------ new chat ------------------------------- */
function ContactPicker({ contacts, selected, onToggle, multi }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = contacts.filter((c) => !needle || c.name.toLowerCase().includes(needle));
  return (
    <div>
      <input placeholder="Search people" aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="contact-list">
        {list.length === 0 && <p className="faint" style={{ padding: 10 }}>No one here yet. Connect with people first — chats open with connections, project teammates and lab members.</p>}
        {list.map((c) => (
          <label key={c.id} className={`contact ${selected.includes(c.id) ? 'on' : ''}`}>
            <input type={multi ? 'checkbox' : 'radio'} name="contact" checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} />
            <span>
              <b>{c.name}</b>
              <span className="faint"> {[c.role === 'FACULTY' ? c.title || 'Faculty' : c.program, c.department?.code].filter(Boolean).join(', ')}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function NewChat({ onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('direct');
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { data, loading } = useQuery(CHAT_START, { fetchPolicy: 'network-only' });
  const refetch = { refetchQueries: [CONVERSATIONS] };
  const [openDirect] = useMutation(OPEN_DIRECT, refetch);
  const [createGroup, { loading: creating }] = useMutation(CREATE_GROUP, refetch);
  const [openProject] = useMutation(OPEN_PROJECT_CHAT, refetch);
  const [openLab] = useMutation(OPEN_LAB_CHAT, refetch);
  const go = (id) => { onClose(); navigate(`/messages/${id}`); };
  const fail = (e) => toast({ kind: 'error', title: 'Could not open chat', body: errorText(e) });
  const contacts = data?.chatContacts ?? [];
  const me = data?.me;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="New chat" onClick={(e) => e.stopPropagation()}>
        <div className="spread"><h2>New chat</h2><button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="row" role="tablist" style={{ margin: '12px 0' }}>
          {[['direct', 'Direct message'], ['group', 'New group'], ['team', 'Team & lab chats']].map(([v, l]) => (
            <button key={v} role="tab" aria-selected={tab === v} className={`btn btn-sm ${tab === v ? 'btn-primary' : ''}`} onClick={() => { setTab(v); setPicked([]); }}>{l}</button>
          ))}
        </div>
        {loading && <Loading />}

        {data && tab === 'direct' && (
          <div className="stack">
            <ContactPicker contacts={contacts} selected={picked} onToggle={(id) => setPicked([id])} />
            <div><button className="btn btn-primary" disabled={!picked.length} onClick={() => openDirect({ variables: { userId: picked[0] } }).then(({ data: d }) => go(d.openDirectConversation.id)).catch(fail)}>Open chat</button></div>
          </div>
        )}

        {data && tab === 'group' && (
          <form className="stack" onSubmit={(e) => {
            e.preventDefault();
            createGroup({ variables: { input: { name, description, memberIds: picked } } }).then(({ data: d }) => go(d.createGroupConversation.id)).catch(fail);
          }}>
            <label className="field">Group name<input required maxLength={80} placeholder={me?.role === 'FACULTY' ? 'e.g. Thesis students 2026' : 'e.g. Hackathon team'} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field">What's it for? (optional)<input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <span className="picker-label">Members {picked.length > 0 && <em>· {picked.length} selected</em>}</span>
            <ContactPicker multi contacts={contacts} selected={picked} onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />
            <div><button className="btn btn-primary" disabled={!picked.length || !name.trim() || creating}>Create group</button></div>
          </form>
        )}

        {data && tab === 'team' && (
          <div className="stack">
            <p className="faint">One chat per project or lab, with everyone on it. New members are added automatically when their request is accepted.</p>
            {me.lab && (
              <button className="list-btn" onClick={() => openLab({ variables: { labId: me.lab.id } }).then(({ data: d }) => go(d.openLabConversation.id)).catch(fail)}>
                <b>⌂ {me.lab.name}</b><span className="faint">Lab group</span>
              </button>
            )}
            {me.projects.map((p) => (
              <button key={p.id} className="list-btn" onClick={() => openProject({ variables: { projectId: p.id } }).then(({ data: d }) => go(d.openProjectConversation.id)).catch(fail)}>
                <b>◆ {p.title}</b><span className="faint">{p.owner.id === me.id ? 'Your project' : 'Project team'}</span>
              </button>
            ))}
            {!me.lab && me.projects.length === 0 && <p className="faint">You're not on any project or in a lab yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------- group details ---------------------------- */
function Details({ conv, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: conv.name ?? '', description: conv.description ?? '' });
  const { data: start } = useQuery(CHAT_START, { skip: !adding, fetchPolicy: 'network-only' });
  const [add, { loading: addingNow }] = useMutation(ADD_MEMBERS);
  const [remove] = useMutation(REMOVE_MEMBER);
  const [leave] = useMutation(LEAVE_CONVERSATION, { refetchQueries: [CONVERSATIONS] });
  const [update] = useMutation(UPDATE_CONVERSATION);
  const fail = (title) => (e) => toast({ kind: 'error', title, body: errorText(e) });
  const memberIds = new Set(conv.members.map((m) => m.id));
  const admins = new Set(conv.admins.map((a) => a.id));

  if (conv.type === 'DIRECT') {
    const o = conv.otherUser;
    return (
      <aside className="chat-details">
        <div className="spread"><h3>About</h3><button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close details">✕</button></div>
        {o && <><Avatar user={o} size="lg" /><p style={{ marginTop: 10 }}><UserLink user={o} /></p><p className="faint">{[o.title || o.program, o.department?.name].filter(Boolean).join(', ')}</p></>}
      </aside>
    );
  }

  return (
    <aside className="chat-details">
      <div className="spread"><h3>Group</h3><button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close details">✕</button></div>
      {editing ? (
        <form className="stack" style={{ marginTop: 10 }} onSubmit={(e) => {
          e.preventDefault();
          update({ variables: { conversationId: conv.id, ...form } }).then(() => setEditing(false)).catch(fail('Not saved'));
        }}>
          <label className="field">Name<input required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field">Description<textarea maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="row"><button className="btn btn-primary btn-sm">Save</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button></div>
        </form>
      ) : (
        <div style={{ marginTop: 8 }}>
          <b className="serif">{conv.title}</b>
          {conv.description && <p className="faint" style={{ marginTop: 4 }}>{conv.description}</p>}
          {conv.project && <p className="faint">Project: <Link to={`/projects/${conv.project.id}`}>{conv.project.title}</Link></p>}
          {conv.canManage && <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => setEditing(true)}>Rename / edit</button>}
        </div>
      )}

      <div className="spread" style={{ marginTop: 14 }}>
        <span className="picker-label">{conv.memberCount} members</span>
        {conv.canManage && !adding && <button className="btn btn-sm" onClick={() => setAdding(true)}>Add people</button>}
      </div>
      {adding && (
        <div className="stack" style={{ margin: '10px 0' }}>
          {!start ? <Loading /> : (
            <ContactPicker multi contacts={start.chatContacts.filter((c) => !memberIds.has(c.id))} selected={picked}
              onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />
          )}
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={!picked.length || addingNow} onClick={() => add({ variables: { conversationId: conv.id, userIds: picked } }).then(() => { setAdding(false); setPicked([]); }).catch(fail('Not added'))}>Add {picked.length || ''}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setPicked([]); }}>Cancel</button>
          </div>
        </div>
      )}
      <ul className="member-list">
        {conv.members.map((m) => (
          <li key={m.id}>
            <span><UserLink user={m} />{m.id === user.id && ' (you)'} {admins.has(m.id) && <span className="faint">admin</span>}</span>
            {conv.canManage && m.id !== user.id && (
              <button className="btn btn-ghost btn-sm btn-danger" onClick={() => {
                if (window.confirm(`Remove ${m.name} from the group?`)) remove({ variables: { conversationId: conv.id, userId: m.id } }).catch(fail('Not removed'));
              }}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      <button className="btn btn-sm btn-danger" style={{ marginTop: 12 }} onClick={() => {
        if (window.confirm('Leave this group? You will stop receiving its messages.')) leave({ variables: { conversationId: conv.id } }).then(() => navigate('/messages')).catch(fail('Could not leave'));
      }}>Leave group</button>
    </aside>
  );
}

/* --------------------------------- page -------------------------------- */
export default function Messages() {
  const { id } = useParams();
  const [creating, setCreating] = useState(false);
  return (
    <div className={`messages ${id ? 'has-chat' : ''}`}>
      <Inbox activeId={id} onNew={() => setCreating(true)} />
      {id ? <ChatThread key={id} id={id} Details={Details} ConvIcon={ConvIcon} /> : (
        <section className="chat empty-chat">
          <Empty>
            <p><b>Pick a chat, or start one.</b></p>
            <p>You can message connections, project teammates and lab members. Faculty can make a group for their students; students can make their own team groups.</p>
            <p><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>New chat</button></p>
          </Empty>
        </section>
      )}
      {creating && <NewChat onClose={() => setCreating(false)} />}
    </div>
  );
}
