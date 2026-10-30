import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { SEARCH_FACULTY, DEPARTMENTS } from '../graphql/operations.js';
import PersonRow from '../components/PersonRow.jsx';
import { Loading, ErrorNote, Empty, csv } from '../components/ui.jsx';

const PAGE = 15;

/**
 * The headline query, written as an editable sentence:
 * "Faculty working on [nlp] who published in the last [2] years, with an open lab slot".
 */
export default function Discover() {
  const [area, setArea] = useState('nlp');
  const [years, setYears] = useState(2);
  const [recentOnly, setRecentOnly] = useState(true);
  const [openOnly, setOpenOnly] = useState(true);
  const [skills, setSkills] = useState('');
  const [dept, setDept] = useState('');
  const [page, setPage] = useState(0);
  const { data: deptData } = useQuery(DEPARTMENTS);

  const input = {
    area: area.trim() || null,
    publishedWithinYears: recentOnly ? Number(years) || 2 : null,
    hasOpenSlots: openOnly || null,
    skills: csv(skills).length ? csv(skills) : null,
    departmentId: dept || null,
    limit: PAGE,
    offset: page * PAGE,
  };
  const { data, loading, error, previousData } = useQuery(SEARCH_FACULTY, { variables: { input } });
  const result = (data ?? previousData)?.searchFaculty;
  const reset = (fn) => (e) => { fn(e); setPage(0); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Find faculty</h1>
          <p className="muted">Filter by what people are publishing now, not what their department page said years ago.</p>
        </div>
      </div>

      <form className="query-sentence" onSubmit={(e) => e.preventDefault()} aria-label="Faculty search">
        <span>Faculty working on</span>
        <input type="text" aria-label="Research area" value={area} placeholder="any area" onChange={reset((e) => setArea(e.target.value))} />
        <label className="check">
          <input type="checkbox" checked={recentOnly} onChange={reset((e) => setRecentOnly(e.target.checked))} />
          who published in the last
        </label>
        <input type="number" min={1} max={10} aria-label="Years" value={years} disabled={!recentOnly} onChange={reset((e) => setYears(e.target.value))} />
        <span>years</span>
        <label className="check">
          <input type="checkbox" checked={openOnly} onChange={reset((e) => setOpenOnly(e.target.checked))} />
          with an open lab slot
        </label>
      </form>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <label className="field">Must have skills (comma-separated)
          <input value={skills} placeholder="python, pytorch" onChange={reset((e) => setSkills(e.target.value))} />
        </label>
        <label className="field">Department
          <select value={dept} onChange={reset((e) => setDept(e.target.value))}>
            <option value="">All departments</option>
            {deptData?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>

      <ErrorNote error={error} />
      {!result && loading && <Loading what="Searching" />}
      {result && (
        <>
          <p className="results-meta">
            {result.totalCount} {result.totalCount === 1 ? 'person matches' : 'people match'}
            {loading && ' — updating…'}
          </p>
          {result.items.length === 0 ? (
            <Empty>
              <p>No one matches every filter.</p>
              <p>Try a broader area, a longer publishing window, or include full labs.</p>
            </Empty>
          ) : (
            <div className="people">
              {result.items.map((u) => (
                <PersonRow key={u.id} user={u} highlightArea={area.trim()} highlightSkills={csv(skills)} />
              ))}
            </div>
          )}
          {result.totalCount > PAGE && (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="faint">Page {page + 1} of {Math.ceil(result.totalCount / PAGE)}</span>
              <button className="btn btn-sm" disabled={(page + 1) * PAGE >= result.totalCount} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
