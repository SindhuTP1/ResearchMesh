import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* ------------------------------ toasts ------------------------------ */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);
  const push = useCallback((t) => {
    const id = nextId.current++;
    setToasts((xs) => [...xs, { id, kind: 'live', ...t }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.ms ?? 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.title && <b>{t.title}</b>}
            {t.body}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Turn an Apollo error into one readable sentence. */
export function errorText(err) {
  if (!err) return '';
  const gqlErrors = err.errors ?? err.graphQLErrors;
  if (gqlErrors?.length) return gqlErrors.map((e) => e.message).join('. ');
  return err.message ?? String(err);
}

/* ----------------------------- primitives --------------------------- */
const initials = (name = '') =>
  name.replace(/^Dr\.\s*/, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function Avatar({ user, size }) {
  return (
    <div className={`avatar ${user?.role === 'FACULTY' ? 'faculty' : ''} ${size ?? ''}`} aria-hidden="true">
      {initials(user?.name)}
    </div>
  );
}

export function SkillChip({ skill, hit }) {
  return (
    <span className={`chip ${hit ? 'hit' : ''}`} title={`${skill.name} · level ${skill.level} of 5`}>
      {skill.name}
      <span className="lvl" aria-label={`level ${skill.level} of 5`}>
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= skill.level ? 'on' : ''} />)}
      </span>
    </span>
  );
}

export function Skills({ skills = [], highlight = [], max = 8 }) {
  const hl = new Set(highlight.map((h) => h.toLowerCase()));
  return (
    <div className="chips">
      {skills.slice(0, max).map((s) => <SkillChip key={s.name} skill={s} hit={hl.has(s.name)} />)}
    </div>
  );
}

export function Interests({ items = [], highlight = '' }) {
  const h = highlight.toLowerCase();
  return (
    <div className="chips">
      {items.map((i) => (
        <span key={i} className={`chip interest ${h && i.includes(h) ? 'hit' : ''}`}>{i}</span>
      ))}
    </div>
  );
}

export function Status({ value }) {
  if (!value) return null;
  const label = value.charAt(0) + value.slice(1).toLowerCase().replace('_', ' ');
  return <span className={`status ${value.toLowerCase()}`}>{label}</span>;
}

export function Loading({ what = 'Loading' }) {
  return <p className="loading">{what}…</p>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <p className="alert" role="alert">{errorText(error)}</p>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function UserLink({ user }) {
  if (!user) return null;
  return <Link to={`/people/${user.id}`}>{user.name}</Link>;
}

export function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(iso).toLocaleDateString();
}

export const csv = (s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
