import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { GLOBAL_SEARCH } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Ctrl/⌘ + K: jump to any page, or find people, projects and labs.
 * Pages come from the sidebar for the current role; the rest comes from the global search query,
 * with a last row that opens the full /search page.
 */
const ICONS = { page: '↳', person: '👤', project: '📁', lab: '🧪', search: '🔎' };

export default function CommandPalette({ nav, open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef(null);
  const needle = q.trim().toLowerCase();

  useEffect(() => { if (open) { setQ(''); setActive(0); requestAnimationFrame(() => input.current?.focus()); } }, [open]);

  const pages = useMemo(() => nav.flatMap(([group, links]) => links.map(([to, label]) => ({
    kind: 'page', label, hint: group, to: to === '/profile' ? `/people/${user.id}` : to,
  }))), [nav, user.id]);

  const searchPeople = needle.length >= 2 && user.role !== 'ADMIN';
  const { data, previousData } = useQuery(GLOBAL_SEARCH, { variables: { q: needle, limit: 3 }, skip: !searchPeople });
  const s = searchPeople ? (data ?? previousData)?.search : null;
  const hint = (...xs) => xs.filter(Boolean).join(' · ');

  const results = [
    ...pages.filter((p) => !needle || p.label.toLowerCase().includes(needle) || p.hint.toLowerCase().includes(needle)),
    ...(s ? [...s.faculty, ...s.students].map((u) => ({
      kind: 'person', label: u.name, hint: hint(u.title || u.program, u.department?.code), to: `/people/${u.id}`,
    })) : []),
    ...(s ? s.projects.map((p) => ({ kind: 'project', label: p.title, hint: hint('Project', p.owner.name), to: `/projects/${p.id}` })) : []),
    ...(s ? s.labs.map((l) => ({ kind: 'lab', label: l.name, hint: hint('Lab', l.department.code), to: `/search?q=${encodeURIComponent(l.name)}&type=LAB` })) : []),
  ].slice(0, 12);
  if (searchPeople) results.push({ kind: 'search', label: `See all results for “${q.trim()}”`, hint: 'Search', to: `/search?q=${encodeURIComponent(q.trim())}` });

  useEffect(() => { setActive(0); }, [needle]);
  if (!open) return null;

  const go = (r) => { onClose(); navigate(r.to); };
  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Quick search" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input} value={q} placeholder={user.role === 'ADMIN' ? 'Jump to a page…' : 'Jump to a page, or search people, projects, labs…'} aria-label="Search"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && results[active]) go(results[active]);
          }}
        />
        <ul role="listbox">
          {results.length === 0 && <li className="faint" style={{ padding: 14 }}>Nothing found.</li>}
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.to}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
              onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
              <span className="pal-icon" aria-hidden="true">{ICONS[r.kind]}</span>
              <span>{r.label}</span>
              <span className="faint">{r.hint}</span>
            </li>
          ))}
        </ul>
        <div className="palette-foot faint">↑ ↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>
  );
}
