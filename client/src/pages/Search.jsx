import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { GLOBAL_SEARCH } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PersonRow from '../components/PersonRow.jsx';
import { PersonActions } from '../components/social.jsx';
import { Loading, ErrorNote, Empty, UserLink } from '../components/ui.jsx';
import { ProjectCard } from './Projects.jsx';

const MIN = 2;
const PREVIEW = 5;
const PAGE = 15;

/** Tab id → [label, list field, count field] */
const TABS = [
  ['ALL', 'All'],
  ['FACULTY', 'Faculty', 'faculty', 'facultyCount'],
  ['STUDENT', 'Students', 'students', 'studentCount'],
  ['PROJECT', 'Projects', 'projects', 'projectCount'],
  ['LAB', 'Labs', 'labs', 'labCount'],
  ['PUBLICATION', 'Publications', 'publications', 'publicationCount'],
];
const SUGGESTIONS = ['nlp', 'machine learning', 'genomics', 'python', 'robotics', 'cybersecurity', 'iot', 'cloud'];

function LabRow({ lab, terms }) {
  return (
    <div className="list-row">
      <div>
        <span className="serif" style={{ fontWeight: 600 }}>{lab.name}</span>
        <div className="faint">{lab.department.code} · headed by <UserLink user={lab.head} /> · {lab.memberCount} {lab.memberCount === 1 ? 'member' : 'members'}</div>
        <div className="chips">{lab.researchAreas.map((a) => <span key={a} className={`chip interest ${terms.some((t) => a.includes(t)) ? 'hit' : ''}`}>{a}</span>)}</div>
      </div>
      <div className="faint" style={{ whiteSpace: 'nowrap' }}>
        {lab.openSlots > 0 ? <strong style={{ color: 'var(--moss-ink)' }}>{lab.openSlots} open</strong> : 'Full'}
      </div>
    </div>
  );
}

function PublicationRow({ p, terms }) {
  const link = p.url || (p.doi ? `https://doi.org/${p.doi}` : null);
  return (
    <div className="list-row">
      <div>
        {link ? <a href={link} target="_blank" rel="noreferrer" className="serif" style={{ fontWeight: 600 }}>{p.title}</a> : <span className="serif" style={{ fontWeight: 600 }}>{p.title}</span>}
        <div className="faint">
          {p.authors.map((a, i) => <span key={a.id}>{i > 0 && ', '}<UserLink user={a} /></span>)}
          {p.externalAuthors.length > 0 && `${p.authors.length ? ', ' : ''}${p.externalAuthors.join(', ')}`}
        </div>
        {p.keywords.length > 0 && <div className="chips">{p.keywords.map((k) => <span key={k} className={`chip interest ${terms.some((t) => k.includes(t)) ? 'hit' : ''}`}>{k}</span>)}</div>}
      </div>
      <div className="faint" style={{ whiteSpace: 'nowrap' }}>{[p.venue, p.year].filter(Boolean).join(' ')}</div>
    </div>
  );
}

/** Renders one list of results in the shape that suits it. */
function Results({ tab, items, terms, isFaculty }) {
  if (tab === 'FACULTY' || tab === 'STUDENT') {
    return (
      <div className="people">
        {items.map((u) => (
          <PersonRow
            key={u.id} user={u} highlightArea={terms[0] ?? ''} highlightSkills={terms}
            side={<PersonActions user={u} invite={isFaculty && u.role === 'STUDENT'} />}
          />
        ))}
      </div>
    );
  }
  if (tab === 'PROJECT') return <div className="project-list">{items.map((p) => <ProjectCard key={p.id} p={p} />)}</div>;
  if (tab === 'LAB') return <div>{items.map((l) => <LabRow key={l.id} lab={l} terms={terms} />)}</div>;
  return <div>{items.map((p) => <PublicationRow key={p.id} p={p} terms={terms} />)}</div>;
}

/**
 * Global search for students and faculty: one box, every kind of result.
 * The query and tab live in the URL (?q=…&type=…) so results can be bookmarked, shared, and survive Back.
 */
export default function Search() {
  const { isFaculty } = useAuth();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const tab = TABS.some(([id]) => id === params.get('type')) ? params.get('type') : 'ALL';
  const [text, setText] = useState(q);
  const [page, setPage] = useState(0);
  const inputRef = useRef(null);

  // Typing updates the URL after a short pause; the URL drives the query.
  // Only pull the URL into the box when it changed from outside (Back, a dashboard search), so a
  // trailing space the user is typing isn't trimmed away mid-word.
  useEffect(() => { setText((t) => (t.trim() === q ? t : q)); }, [q]);
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (text.trim()) next.set('q', text.trim()); else next.delete('q');
      setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [text, q, params, setParams]);
  useEffect(() => { setPage(0); }, [q, tab]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'ALL') next.delete('type'); else next.set('type', id);
    setParams(next);
  };

  const ready = q.length >= MIN;
  const { data, previousData, loading, error } = useQuery(GLOBAL_SEARCH, {
    variables: tab === 'ALL'
      ? { q, limit: PREVIEW }
      : { q, type: tab, limit: PAGE, offset: page * PAGE },
    skip: !ready,
  });
  const r = (data ?? previousData)?.search;
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const total = r ? TABS.slice(1).reduce((n, [, , , c]) => n + r[c], 0) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Search</h1>
          <p className="muted">
            {isFaculty
              ? 'Find students, colleagues, projects, labs and papers by name, skill or research area.'
              : 'Find faculty, fellow students, projects, labs and papers by name, skill or research area.'}
          </p>
        </div>
      </div>

      <form className="search-box big" role="search" onSubmit={(e) => e.preventDefault()}>
        <span aria-hidden="true">🔎</span>
        <input
          ref={inputRef} type="search" value={text} aria-label="Search"
          placeholder={isFaculty ? 'e.g. python genomics, Siri, robotics lab…' : 'e.g. nlp, Dr. Rao, machine learning…'}
          onChange={(e) => setText(e.target.value)}
        />
        {loading && <span className="faint">Searching…</span>}
      </form>

      {!ready && (
        <div className="quick-fields" aria-label="Try searching for">
          <span className="faint">Try:</span>
          {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip-toggle" onClick={() => setText(s)}>{s}</button>)}
        </div>
      )}

      {ready && r && (
        <div className="row search-tabs" role="tablist" aria-label="Result type">
          {TABS.map(([id, label, , countKey]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`btn btn-sm ${tab === id ? 'btn-primary' : ''}`} onClick={() => setTab(id)}>
              {label} <span className="tab-count">{countKey ? r[countKey] : total}</span>
            </button>
          ))}
        </div>
      )}

      <ErrorNote error={error} />
      {ready && !r && loading && <Loading what="Searching" />}

      {ready && r && total === 0 && (
        <Empty>
          <p>Nothing matches “{q}”.</p>
          <p>Every word has to match, so try fewer words, or a broader area like “ai” instead of a long phrase.</p>
        </Empty>
      )}

      {ready && r && total > 0 && tab === 'ALL' && TABS.slice(1).map(([id, label, listKey, countKey]) => (
        r[countKey] > 0 && (
          <section key={id} className="search-section">
            <div className="panel-title">
              <h3>{label} <span className="faint">({r[countKey]})</span></h3>
              {r[countKey] > r[listKey].length && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTab(id)}>See all {r[countKey]} →</button>}
            </div>
            <Results tab={id} items={r[listKey]} terms={terms} isFaculty={isFaculty} />
          </section>
        )
      ))}

      {ready && r && tab !== 'ALL' && (() => {
        const [, label, listKey, countKey] = TABS.find(([id]) => id === tab);
        const count = r[countKey];
        if (count === 0) return <Empty><p>No {label.toLowerCase()} match “{q}”.</p></Empty>;
        return (
          <>
            <p className="results-meta">{count} {count === 1 ? 'result' : 'results'}{loading && ' — updating…'}</p>
            <Results tab={tab} items={r[listKey]} terms={terms} isFaculty={isFaculty} />
            {count > PAGE && (
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
                <span className="faint">Page {page + 1} of {Math.ceil(count / PAGE)}</span>
                <button className="btn btn-sm" disabled={(page + 1) * PAGE >= count} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            )}
            {tab === 'FACULTY' && <p className="faint" style={{ marginTop: 16 }}>Need filters like “published in the last 2 years” or “open lab slot”? Use <Link to="/discover">{isFaculty ? 'Faculty directory' : 'Find faculty'}</Link>.</p>}
            {tab === 'STUDENT' && isFaculty && <p className="faint" style={{ marginTop: 16 }}>For skill levels, year and lab filters, use <Link to="/students">Find students</Link>.</p>}
            {tab === 'STUDENT' && !isFaculty && <p className="faint" style={{ marginTop: 16 }}>Looking for a team? <Link to="/teammates">Find teammates</Link> ranks students by how well you'd work together.</p>}
          </>
        );
      })()}
    </>
  );
}
