import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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

/** Shimmering placeholder rows instead of a bare "Loading…". */
export function Loading({ what = 'Loading', rows = 3 }) {
  return (
    <div className="skeleton" role="status" aria-label={`${what}…`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <span className="sk-avatar" />
          <span className="sk-lines"><span style={{ width: `${70 - i * 12}%` }} /><span style={{ width: `${45 + i * 8}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animate a number from 0 (or its previous value) to `value`. */
export function useCountUp(value, ms = 900) {
  const [shown, setShown] = useState(typeof value === 'number' ? 0 : value);
  const from = useRef(0);
  useEffect(() => {
    if (typeof value !== 'number' || reducedMotion()) { setShown(value); return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** A little celebration — used when a request/connection is accepted. */
export function confetti(x = window.innerWidth / 2, y = window.innerHeight / 3) {
  if (reducedMotion()) return;
  const colors = ['var(--moss)', 'var(--amber)', 'var(--m-interest)', 'var(--m-availability)', 'var(--rose)'];
  const box = document.createElement('div');
  box.className = 'confetti';
  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
  for (let i = 0; i < 36; i++) {
    const p = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 60}px`);
    p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = `${Math.random() * 80}ms`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1400);
}

/** Horizontal card slider: scroll-snap + arrow buttons + dots, swipeable on touch. */
export function Slider({ children, label }) {
  const track = useRef(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    const measure = () => {
      setPages(Math.max(1, Math.round(el.scrollWidth / el.clientWidth)));
      setPage(Math.round(el.scrollLeft / el.clientWidth));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [items.length]);
  const go = (dir) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.9, behavior: reducedMotion() ? 'auto' : 'smooth' });
  return (
    <div className="slider" role="region" aria-label={label}>
      <button type="button" className="slider-arrow prev" aria-label="Previous" disabled={page <= 0} onClick={() => go(-1)}>‹</button>
      <div className="slider-track" ref={track}>{items}</div>
      <button type="button" className="slider-arrow next" aria-label="Next" disabled={page >= pages - 1} onClick={() => go(1)}>›</button>
      {pages > 1 && (
        <div className="slider-dots" aria-hidden="true">
          {Array.from({ length: pages }, (_, i) => <span key={i} className={i === page ? 'on' : ''} />)}
        </div>
      )}
    </div>
  );
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

/* --------------------------- filters & stats ------------------------ */

/**
 * Multi-select chips built from real data ({ value, count }). Typing filters the list;
 * selected chips always stay visible so you can see (and undo) what's applied.
 */
export function ChipPicker({ label, options = [], selected = [], onChange, initial = 14, placeholder = 'Filter…' }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const sel = new Set(selected);
  const needle = q.trim().toLowerCase();
  const matches = options.filter((o) => !needle || o.value.toLowerCase().includes(needle));
  const shown = [...options.filter((o) => sel.has(o.value) && !matches.includes(o)), ...(all || needle ? matches : matches.slice(0, initial))];
  const toggle = (v) => onChange(sel.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <div className="chip-picker">
      <div className="spread">
        <span className="picker-label">{label}{selected.length > 0 && <em> · {selected.length} selected</em>}</span>
        <span className="row" style={{ gap: 6 }}>
          {options.length > initial && <input className="picker-search" aria-label={`Filter ${label}`} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />}
          {selected.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>Clear</button>}
        </span>
      </div>
      <div className="chips">
        {shown.map((o) => (
          <button type="button" key={o.value} className={`chip-toggle ${sel.has(o.value) ? 'on' : ''}`} aria-pressed={sel.has(o.value)} onClick={() => toggle(o.value)}>
            {o.label ?? o.value}{o.count != null && <span className="n">{o.count}</span>}
          </button>
        ))}
        {!needle && options.length > initial && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `+${options.length - initial} more`}</button>
        )}
        {needle && matches.length === 0 && <span className="faint">No match for “{q}”.</span>}
      </div>
    </div>
  );
}

export function Stat({ value, label, to, tone }) {
  const shown = useCountUp(value);
  const body = <><b>{shown}</b><span>{label}</span></>;
  return to ? <Link to={to} className={`stat stat-link ${tone ?? ''}`}>{body}</Link> : <div className={`stat ${tone ?? ''}`}>{body}</div>;
}

export function Meter({ value, label }) {
  const target = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const [pct, setPct] = useState(0);
  useEffect(() => { const t = requestAnimationFrame(() => setPct(target)); return () => cancelAnimationFrame(t); }, [target]);
  return (
    <div className="meter" role="meter" aria-valuenow={target} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function VerifiedBadge({ user }) {
  if (user?.role !== 'FACULTY') return null;
  if (user.isVerified) return <span className="verified" title="Verified by the university admin">✓ Verified</span>;
  return <span className="unverified" title="Not yet verified by an admin">Unverified</span>;
}

export const money = (n, c = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
export const firstName = (name = '') => name.replace(/^Dr\.\s*/, '').split(/\s+/)[0];
