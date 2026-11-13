import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { SEARCH_FACULTY, SEARCH_STUDENTS } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * Ctrl/⌘ + K: jump to any page, or find a person by name.
 * Pages come from the sidebar for the current role; people search uses the existing search queries.
 */
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
  const { data: fac } = useQuery(SEARCH_FACULTY, { variables: { input: { name: needle, limit: 5 } }, skip: !searchPeople });
  const { data: stu } = useQuery(SEARCH_STUDENTS, { variables: { input: { name: needle, limit: 5 } }, skip: !searchPeople || user.role !== 'FACULTY' });

  const results = [
    ...pages.filter((p) => !needle || p.label.toLowerCase().includes(needle) || p.hint.toLowerCase().includes(needle)),
    ...(searchPeople ? [...(fac?.searchFaculty.items ?? []), ...(stu?.searchStudents.items ?? [])].map((u) => ({
      kind: 'person', label: u.name, hint: [u.title || u.program, u.department?.code].filter(Boolean).join(' · '), to: `/people/${u.id}`,
    })) : []),
  ].slice(0, 12);

  useEffect(() => { setActive(0); }, [needle]);
  if (!open) return null;

  const go = (r) => { onClose(); navigate(r.to); };
  return (
    <div className="modal-backdrop palette-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Quick search" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input} value={q} placeholder="Jump to a page or find someone…" aria-label="Search"
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
              <span className="pal-icon" aria-hidden="true">{r.kind === 'person' ? '👤' : '↳'}</span>
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
