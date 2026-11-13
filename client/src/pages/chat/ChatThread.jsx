import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApolloClient, useMutation, useQuery, useSubscription } from '@apollo/client/react';
import {
  CONVERSATIONS, CONVERSATION, MESSAGES, MESSAGE_ADDED, MESSAGE_UPDATED, SEND_MESSAGE, MARK_CONVERSATION_READ,
  UNREAD_MESSAGE_COUNT, EDIT_MESSAGE, DELETE_MESSAGE, TOGGLE_REACTION, SET_TYPING, TYPING, CONVERSATION_READ,
} from '../../graphql/operations.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCall } from '../../components/CallProvider.jsx';
import { Avatar, Loading, ErrorNote, Empty, UserLink, useToast, errorText } from '../../components/ui.jsx';

/* ------------------------------- helpers ------------------------------- */
export const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};
const bytes = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);
const fileIcon = (mime = '', name = '') => {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return '📕';
  if (mime.startsWith('video/')) return '🎞️';
  if (mime.startsWith('audio/')) return '🎵';
  if (/zip|tar|rar|7z/.test(mime + name)) return '🗜️';
  if (/sheet|excel|csv/.test(mime + name)) return '📊';
  if (/presentation|powerpoint/.test(mime + name)) return '📽️';
  if (/word|document|\.docx?$/.test(mime + name)) return '📄';
  return '📎';
};
export const REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏', '🔥', '✅'];
const EMOJI = ['😀', '😄', '😂', '🙂', '😉', '😍', '🤔', '😅', '😎', '🥳', '🙌', '👏', '👍', '👌', '🙏', '💪', '🔥', '✨', '🎉', '✅', '❤️', '💡', '📌', '🚀'];
const MAX_FILE = 10 * 1024 * 1024;

/** XHR (not fetch) so we can show upload progress. */
function uploadFile(conversationId, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?conversationId=${encodeURIComponent(conversationId)}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection'));
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}

/* ------------------------------ attachments ----------------------------- */
function AttachmentView({ a, token, onOpen }) {
  const src = `${a.url}?token=${encodeURIComponent(token)}`;
  if (a.isImage) {
    return (
      <button type="button" className="att-image" onClick={() => onOpen({ ...a, src })} aria-label={`Open image ${a.name}`}>
        <img src={src} alt={a.name} loading="lazy" />
      </button>
    );
  }
  return (
    <a className="att-file" href={src} target="_blank" rel="noreferrer" download={a.name}>
      <span className="att-icon" aria-hidden="true">{fileIcon(a.mime, a.name)}</span>
      <span className="att-meta"><b>{a.name}</b><span className="faint">{bytes(a.size)} · download</span></span>
    </a>
  );
}

function Lightbox({ img, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-label={img.name} onClick={onClose}>
      <img src={img.src} alt={img.name} onClick={(e) => e.stopPropagation()} />
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span>{img.name} · {bytes(img.size)}</span>
        <a className="btn btn-sm" href={img.src} download={img.name}>Download</a>
        <button className="btn btn-sm" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/* ------------------------------- message -------------------------------- */
function MessageBubble({ m, mine, showName, canModerate, token, onReact, onEdit, onDelete, onOpenImage, receipt }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [picker, setPicker] = useState(false);

  if (m.isDeleted) {
    return (
      <div className={`bubble-row ${mine ? 'mine' : ''}`}>
        <div className="bubble deleted"><span>🚫 This message was deleted</span><div className="bubble-time">{time(m.createdAt)}</div></div>
      </div>
    );
  }

  return (
    <div className={`bubble-row ${mine ? 'mine' : ''}`}>
      <div className="bubble-wrap">
        <div className="bubble">
          {showName && <div className="bubble-name">{m.sender?.name}</div>}
          {m.attachment && <AttachmentView a={m.attachment} token={token} onOpen={onOpenImage} />}
          {editing ? (
            <form className="edit-box" onSubmit={(e) => { e.preventDefault(); onEdit(m, draft).then((ok) => ok && setEditing(false)); }}>
              <textarea autoFocus value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setEditing(false); setDraft(m.body); }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEdit(m, draft).then((ok) => ok && setEditing(false)); }
                }} />
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-primary btn-sm">Save</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDraft(m.body); }}>Cancel</button>
              </div>
            </form>
          ) : m.body && <div className="bubble-body">{m.body}</div>}
          <div className="bubble-time">{m.editedAt && <span className="edited">edited · </span>}{time(m.createdAt)}{mine && receipt && <span className={`receipt ${receipt.seen ? 'seen' : ''}`} title={receipt.title}> {receipt.label}</span>}</div>
        </div>

        {m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} type="button" className={`reaction ${r.mine ? 'mine' : ''}`} title={r.users.map((u) => u.name).join(', ')} onClick={() => onReact(m, r.emoji)}>
                {r.emoji} <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {!editing && (
          <div className="msg-tools" role="toolbar" aria-label="Message actions">
            <button type="button" title="React" aria-expanded={picker} onClick={() => setPicker(!picker)}>☺</button>
            {mine && <button type="button" title="Edit" onClick={() => { setDraft(m.body); setEditing(true); }}>✎</button>}
            {(mine || canModerate) && <button type="button" title="Delete" onClick={() => onDelete(m)}>🗑</button>}
            {picker && (
              <div className="reaction-picker" onMouseLeave={() => setPicker(false)}>
                {REACTIONS.map((e) => <button key={e} type="button" onClick={() => { onReact(m, e); setPicker(false); }}>{e}</button>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots({ names }) {
  if (!names.length) return null;
  const label = names.length === 1 ? `${names[0]} is typing` : names.length === 2 ? `${names[0]} and ${names[1]} are typing` : `${names.length} people are typing`;
  return <div className="typing" aria-live="polite"><span className="dots"><i /><i /><i /></span>{label}…</div>;
}

/* --------------------------------- chat --------------------------------- */
export default function ChatThread({ id, Details, ConvIcon }) {
  const { user, token } = useAuth();
  const client = useApolloClient();
  const toast = useToast();
  const { startCall, inCall } = useCall();
  const navigate = useNavigate();
  const { data: convData, error: convError } = useQuery(CONVERSATION, { variables: { id }, fetchPolicy: 'cache-and-network' });
  const { data: msgData, loading, error } = useQuery(MESSAGES, { variables: { conversationId: id }, fetchPolicy: 'network-only' });
  const [older, setOlder] = useState([]);
  const [hasMore, setHasMore] = useState(null);
  const [live, setLive] = useState([]);
  const [patches, setPatches] = useState({});
  const [reads, setReads] = useState({}); // userId → ISO time (live read receipts)
  const [typers, setTypers] = useState({}); // userId → { name, until }
  const [text, setText] = useState('');
  const [pending, setPending] = useState(null); // { file, preview, progress }
  const [dragging, setDragging] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [sending, setSending] = useState(false);
  const [send] = useMutation(SEND_MESSAGE);
  const [edit] = useMutation(EDIT_MESSAGE);
  const [del] = useMutation(DELETE_MESSAGE);
  const [react] = useMutation(TOGGLE_REACTION);
  const [setTyping] = useMutation(SET_TYPING);
  const [markRead] = useMutation(MARK_CONVERSATION_READ, { refetchQueries: [UNREAD_MESSAGE_COUNT] });
  const scroller = useRef(null);
  const stick = useRef(true);
  const fileInput = useRef(null);
  const textRef = useRef(null);
  const typingSent = useRef(0);
  const typingStop = useRef(null);
  const conv = convData?.conversation;

  useEffect(() => { if (msgData) setHasMore(msgData.messages.hasMore); }, [msgData]);
  useEffect(() => () => { if (pending?.preview) URL.revokeObjectURL(pending.preview); }, [pending]);

  const patch = useCallback((m) => setPatches((p) => ({ ...p, [m.id]: m })), []);

  /* ---- live events ---- */
  useSubscription(MESSAGE_ADDED, {
    onData: ({ data }) => {
      const m = data.data?.messageAdded;
      if (m?.conversationId !== id) return;
      setLive((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
      if (m.sender) setTypers((t) => { const n = { ...t }; delete n[m.sender.id]; return n; });
      if (m.sender?.id !== user.id && document.visibilityState === 'visible') markRead({ variables: { conversationId: id } }).catch(() => {});
    },
  });
  useSubscription(MESSAGE_UPDATED, { onData: ({ data }) => { const m = data.data?.messageUpdated; if (m?.conversationId === id) patch(m); } });
  useSubscription(CONVERSATION_READ, {
    onData: ({ data }) => {
      const r = data.data?.conversationRead;
      if (r?.conversationId === id) setReads((x) => ({ ...x, [r.userId]: r.at }));
    },
  });
  useSubscription(TYPING, {
    onData: ({ data }) => {
      const t = data.data?.typing;
      if (t?.conversationId !== id) return;
      setTypers((x) => {
        const n = { ...x };
        if (t.typing) n[t.user.id] = { name: t.user.name.split(' ')[t.user.name.startsWith('Dr.') ? 1 : 0], until: Date.now() + 6000 };
        else delete n[t.user.id];
        return n;
      });
    },
  });
  // Expire typing indicators if a "stopped" event never arrives.
  useEffect(() => {
    if (!Object.keys(typers).length) return undefined;
    const t = setInterval(() => setTypers((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v.until > Date.now()))), 1500);
    return () => clearInterval(t);
  }, [typers]);

  const all = useMemo(() => {
    const map = new Map();
    for (const m of [...older, ...[...(msgData?.messages.items ?? [])].reverse(), ...live]) map.set(m.id, patches[m.id] ?? m);
    return [...map.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [older, msgData, live, patches]);

  /* ---- read state ---- */
  useEffect(() => {
    if (!msgData) return undefined;
    const mark = () => markRead({ variables: { conversationId: id } }).catch(() => {});
    mark();
    const onVis = () => document.visibilityState === 'visible' && mark();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [id, msgData, markRead]);

  const readAt = useMemo(() => {
    const m = {};
    for (const r of conv?.readBy ?? []) m[r.user.id] = r.at;
    return { ...m, ...reads };
  }, [conv, reads]);

  const lastMineId = [...all].reverse().find((m) => m.sender?.id === user.id && !m.isDeleted)?.id;
  const receiptFor = (m) => {
    if (m.id !== lastMineId || !conv) return null;
    const others = conv.members.filter((x) => x.id !== user.id);
    const seenBy = others.filter((o) => readAt[o.id] && new Date(readAt[o.id]) >= new Date(m.createdAt));
    if (conv.type === 'DIRECT') return seenBy.length ? { label: '✓✓ Seen', seen: true, title: `Seen ${time(readAt[seenBy[0].id])}` } : { label: '✓ Sent', title: 'Delivered' };
    if (!seenBy.length) return { label: '✓ Sent', title: 'Not seen yet' };
    return { label: seenBy.length === others.length ? '✓✓ Seen by everyone' : `✓✓ Seen by ${seenBy.length}`, seen: true, title: seenBy.map((s) => s.name).join(', ') };
  };

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [all.length, Object.keys(typers).length]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = async () => {
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const { data } = await client.query({ query: MESSAGES, variables: { conversationId: id, before: all[0]?.createdAt }, fetchPolicy: 'network-only' });
    stick.current = false;
    setOlder((xs) => [...[...data.messages.items].reverse(), ...xs]);
    setHasMore(data.messages.hasMore);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
  };

  /* ---- typing ---- */
  const typingChanged = (value) => {
    setText(value);
    const now = Date.now();
    if (value.trim() && now - typingSent.current > 3000) {
      typingSent.current = now;
      setTyping({ variables: { conversationId: id, typing: true } }).catch(() => {});
    }
    clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => {
      if (typingSent.current) setTyping({ variables: { conversationId: id, typing: false } }).catch(() => {});
      typingSent.current = 0;
    }, 4000);
  };
  const stopTyping = () => {
    clearTimeout(typingStop.current);
    if (typingSent.current) setTyping({ variables: { conversationId: id, typing: false } }).catch(() => {});
    typingSent.current = 0;
  };
  useEffect(() => () => clearTimeout(typingStop.current), []);

  /* ---- attachments ---- */
  const pick = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE) return toast({ kind: 'error', title: 'File too large', body: 'Files are limited to 10 MB.' });
    setPending({ file, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null, progress: 0 });
    textRef.current?.focus();
  };
  const onPaste = (e) => {
    const f = [...(e.clipboardData?.files ?? [])][0];
    if (f) { e.preventDefault(); pick(f); }
  };

  /* ---- send / edit / delete / react ---- */
  const submit = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !pending) || sending) return;
    setSending(true);
    stick.current = true;
    stopTyping();
    try {
      let attachmentId = null;
      if (pending) {
        const up = await uploadFile(id, pending.file, token, (p) => setPending((x) => (x ? { ...x, progress: p } : x)));
        attachmentId = up.fileId;
      }
      const { data } = await send({ variables: { conversationId: id, body, attachmentId } });
      const m = data.sendMessage;
      setLive((xs) => (xs.some((x) => x.id === m.id) ? xs : [...xs, m]));
      setText('');
      setPending(null);
      client.refetchQueries({ include: [CONVERSATIONS] });
    } catch (err) {
      toast({ kind: 'error', title: 'Not sent', body: errorText(err) });
      setPending((x) => (x ? { ...x, progress: 0 } : x));
    } finally {
      setSending(false);
    }
  };

  const onEdit = async (m, body) => {
    try { patch((await edit({ variables: { id: m.id, body } })).data.editMessage); return true; }
    catch (e) { toast({ kind: 'error', title: 'Not edited', body: errorText(e) }); return false; }
  };
  const onDelete = async (m) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    try { patch((await del({ variables: { id: m.id } })).data.deleteMessage); }
    catch (e) { toast({ kind: 'error', title: 'Not deleted', body: errorText(e) }); }
  };
  const onReact = async (m, emoji) => {
    try { patch((await react({ variables: { messageId: m.id, emoji } })).data.toggleReaction); }
    catch (e) { toast({ kind: 'error', title: 'Reaction failed', body: errorText(e) }); }
  };

  /* ---- render ---- */
  if (convError && !conv) {
    return (
      <section className="chat empty-chat">
        <ErrorNote error={convError} />
        <button className="btn btn-sm" onClick={() => navigate('/messages')}>Back to messages</button>
      </section>
    );
  }
  if (!conv) return <section className="chat empty-chat"><div className="skeleton-lines"><span /><span /><span /></div></section>;

  const other = conv.otherUser;
  const onlineCount = conv.members.filter((x) => x.id !== user.id && x.isOnline).length;
  const subtitle = conv.type === 'DIRECT'
    ? <>{other?.isOnline ? <span className="online-text">● Online</span> : 'Offline'}{[other?.title || other?.program, other?.department?.code].filter(Boolean).length ? ` · ${[other?.title || other?.program, other?.department?.code].filter(Boolean).join(', ')}` : ''}</>
    : <>{conv.memberCount} members{onlineCount > 0 && <span className="online-text"> · {onlineCount} online</span>}{conv.project ? ' · project team' : conv.lab ? ' · lab group' : ''}</>;
  const typingNames = Object.values(typers).map((t) => t.name);
  const call = (audioOnly) => startCall({ conversationId: conv.id, title: conv.title, direct: conv.type === 'DIRECT', audioOnly });

  let lastDay = '';
  let lastSender = '';
  return (
    <div className={`chat-wrap ${showDetails ? 'with-details' : ''}`}>
      <section
        className={`chat ${dragging ? 'dragging' : ''}`}
        aria-label={`Chat: ${conv.title}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
      >
        <header className="chat-head">
          <Link to="/messages" className="btn btn-ghost btn-sm back" aria-label="Back to all chats">←</Link>
          <ConvIcon c={conv} />
          <div style={{ minWidth: 0 }}>
            <div className="conv-title">{conv.type === 'DIRECT' && other ? <UserLink user={other} /> : conv.title}</div>
            <div className="faint">{subtitle}</div>
          </div>
          <div className="row chat-actions">
            <button className="icon-btn" disabled={inCall} title={inCall ? 'You are already in a call' : 'Voice call'} aria-label="Start a voice call" onClick={() => call(true)}>📞</button>
            <button className="icon-btn" disabled={inCall} title={inCall ? 'You are already in a call' : 'Video call'} aria-label="Start a video call" onClick={() => call(false)}>📹</button>
            <button className={`icon-btn ${showDetails ? 'on' : ''}`} aria-expanded={showDetails} title={conv.type === 'GROUP' ? 'Members' : 'Info'} aria-label="Details" onClick={() => setShowDetails(!showDetails)}>ⓘ</button>
          </div>
        </header>

        <div className="chat-scroll" ref={scroller} onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}>
          {hasMore && <div style={{ textAlign: 'center' }}><button className="btn btn-ghost btn-sm" onClick={loadOlder}>Load earlier messages</button></div>}
          <ErrorNote error={error} />
          {loading && !msgData && <div className="skeleton-lines"><span /><span /><span /></div>}
          {msgData && all.length === 0 && (
            <div className="chat-hello">
              <div className="wave" aria-hidden="true">👋</div>
              <p><b>Say hello!</b></p>
              <p className="faint">Messages, files and calls here are only visible to {conv.type === 'DIRECT' ? 'the two of you' : 'group members'}.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                {['Hi! 👋', 'Shall we set up a quick call?', 'Here are my notes 📎'].map((s) => (
                  <button key={s} className="chip-toggle" onClick={() => { typingChanged(s); textRef.current?.focus(); }}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {all.map((m) => {
            const d = day(m.createdAt);
            const showDay = d !== lastDay;
            lastDay = d;
            if (m.kind === 'SYSTEM') {
              lastSender = '';
              return (
                <div key={m.id}>
                  {showDay && <div className="day-sep"><span>{d}</span></div>}
                  <div className="sys-msg">{m.body} · {time(m.createdAt)}</div>
                </div>
              );
            }
            const mine = m.sender?.id === user.id;
            const showName = conv.type === 'GROUP' && !mine && (lastSender !== m.sender?.id || showDay);
            lastSender = m.sender?.id;
            return (
              <div key={m.id}>
                {showDay && <div className="day-sep"><span>{d}</span></div>}
                <MessageBubble
                  m={m} mine={mine} showName={showName} canModerate={conv.canManage} token={token} receipt={receiptFor(m)}
                  onReact={onReact} onEdit={onEdit} onDelete={onDelete} onOpenImage={setLightbox}
                />
              </div>
            );
          })}
          <TypingDots names={typingNames} />
        </div>

        {dragging && <div className="drop-overlay"><div>📎 Drop to share with {conv.type === 'DIRECT' ? other?.name : conv.title}</div></div>}

        {pending && (
          <div className="pending-file">
            {pending.preview ? <img src={pending.preview} alt="" /> : <span className="att-icon">{fileIcon(pending.file.type, pending.file.name)}</span>}
            <div className="att-meta">
              <b>{pending.file.name}</b>
              <span className="faint">{bytes(pending.file.size)}{sending ? ` · uploading ${Math.round(pending.progress * 100)}%` : ' · ready to send'}</span>
              {sending && <div className="meter"><span style={{ width: `${pending.progress * 100}%` }} /></div>}
            </div>
            {!sending && <button className="btn btn-ghost btn-sm" onClick={() => setPending(null)} aria-label="Remove attachment">✕</button>}
          </div>
        )}

        <form className="composer" onSubmit={submit}>
          <input ref={fileInput} type="file" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" className="icon-btn" title="Attach a file (or drag & drop / paste)" aria-label="Attach a file" onClick={() => fileInput.current?.click()}>📎</button>
          <div className="emoji-wrap">
            <button type="button" className="icon-btn" aria-label="Insert emoji" aria-expanded={emojiOpen} onClick={() => setEmojiOpen(!emojiOpen)}>😊</button>
            {emojiOpen && (
              <div className="emoji-panel" onMouseLeave={() => setEmojiOpen(false)}>
                {EMOJI.map((e) => (
                  <button type="button" key={e} onClick={() => {
                    const el = textRef.current;
                    const at = el?.selectionStart ?? text.length;
                    typingChanged(text.slice(0, at) + e + text.slice(at));
                    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + e.length, at + e.length); });
                  }}>{e}</button>
                ))}
              </div>
            )}
          </div>
          <textarea
            ref={textRef} rows={1} maxLength={4000} aria-label="Message"
            placeholder={pending ? 'Add a caption (optional)…' : 'Write a message — Enter to send, Shift+Enter for a new line'}
            value={text} onChange={(e) => typingChanged(e.target.value)} onPaste={onPaste} onBlur={stopTyping}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <button className={`send-btn ${text.trim() || pending ? 'ready' : ''}`} disabled={sending || (!text.trim() && !pending)} aria-label="Send">
            {sending ? <span className="spinner" /> : '➤'}
          </button>
        </form>
      </section>
      {showDetails && <Details conv={conv} onClose={() => setShowDetails(false)} />}
      {lightbox && <Lightbox img={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
