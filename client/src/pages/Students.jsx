import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { SEARCH_STUDENTS, DEPARTMENTS, FILTER_OPTIONS } from '../graphql/operations.js';
import PersonRow from '../components/PersonRow.jsx';
import { PersonActions } from '../components/social.jsx';
import { Loading, ErrorNote, Empty, ChipPicker } from '../components/ui.jsx';

const PAGE = 20;
const LOOKING = [['MENTOR', 'a mentor'], ['LAB', 'a lab'], ['PROJECT', 'a project'], ['COLLABORATOR', 'collaborators']];
const EMPTY = { skills: [], minLevel: '', unattached: false, interests: [], dept: '', programs: [], years: [], lookingFor: [], name: '', sortBy: 'RECENTLY_ACTIVE' };

/** Faculty-only: e.g. "students with python + genomics who aren't attached to a lab yet". */
export default function Students() {
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(0);
  const { data: deptData } = useQuery(DEPARTMENTS);
  const { data: opts } = useQuery(FILTER_OPTIONS, { variables: { role: 'STUDENT' } });
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setPage(0); };
  const toggle = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] });

  const input = {
    skills: f.skills.length ? f.skills : null,
    minSkillLevel: f.minLevel ? Number(f.minLevel) : null,
    unattached: f.unattached || null,
    interests: f.interests.length ? f.interests : null,
    departmentId: f.dept || null,
    programs: f.programs.length ? f.programs : null,
    years: f.years.length ? f.years : null,
    lookingFor: f.lookingFor.length ? f.lookingFor : null,
    name: f.name.trim() || null,
    sortBy: f.sortBy,
    limit: PAGE,
    offset: page * PAGE,
  };
  const { data, loading, error, previousData } = useQuery(SEARCH_STUDENTS, { variables: { input } });
  const result = (data ?? previousData)?.searchStudents;
  const o = opts?.filterOptions;
  const active = [f.skills.length, f.minLevel, f.unattached, f.interests.length, f.dept, f.programs.length, f.years.length, f.lookingFor.length, f.name.trim()].filter(Boolean).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Find students</h1>
          <p className="muted">Find students in any department with the skills your work needs. You see their contact details; students only see their own.</p>
        </div>
      </div>

      <form className="query-sentence" onSubmit={(e) => e.preventDefault()} aria-label="Student search">
        <span>Students who know {f.skills.length ? <strong>{f.skills.join(' + ')}</strong> : <em className="faint">(pick skills below)</em>}</span>
        <span>at level</span>
        <select aria-label="Minimum level" value={f.minLevel} onChange={(e) => set({ minLevel: e.target.value })}>
          <option value="">any</option>
          {[2, 3, 4, 5].map((l) => <option key={l} value={l}>{l}+</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={f.unattached} onChange={(e) => set({ unattached: e.target.checked })} />
          and aren't in a lab yet
        </label>
      </form>

      <section className="panel filters" style={{ marginTop: 12 }}>
        <div className="stack">
          <ChipPicker label="Must have all of these skills" options={o?.skills ?? []} selected={f.skills} onChange={(skills) => set({ skills })} initial={20} placeholder="Find a skill…" />
          <ChipPicker label="Interested in (any of)" options={o?.areas ?? []} selected={f.interests} onChange={(interests) => set({ interests })} initial={16} placeholder="Find an interest…" />
          <ChipPicker label="Program" options={(o?.programs ?? []).map((p) => ({ value: p }))} selected={f.programs} onChange={(programs) => set({ programs })} />
          <div className="form-grid">
            <label className="field">Name<input value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="field">Department
              <select value={f.dept} onChange={(e) => set({ dept: e.target.value })}>
                <option value="">All departments</option>
                {deptData?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label className="field">Sort
              <select value={f.sortBy} onChange={(e) => set({ sortBy: e.target.value })}>
                <option value="RECENTLY_ACTIVE">Recently active</option>
                <option value="YEAR">Senior first</option>
                <option value="NAME">Name (A–Z)</option>
              </select>
            </label>
          </div>
          <div className="row">
            <span className="picker-label">Year</span>
            {[1, 2, 3, 4, 5].map((y) => (
              <label key={y} className="check"><input type="checkbox" checked={f.years.includes(y)} onChange={() => toggle('years', y)} />{y}</label>
            ))}
          </div>
          <div className="row">
            <span className="picker-label">Looking for</span>
            {LOOKING.map(([v, l]) => (
              <label key={v} className="check"><input type="checkbox" checked={f.lookingFor.includes(v)} onChange={() => toggle('lookingFor', v)} />{l}</label>
            ))}
          </div>
          {active > 0 && <div><button type="button" className="btn btn-sm" onClick={() => set(EMPTY)}>Clear all filters ({active})</button></div>}
        </div>
      </section>

      <ErrorNote error={error} />
      {!result && loading && <Loading what="Searching" />}
      {result && (
        <>
          <p className="results-meta">{result.totalCount} {result.totalCount === 1 ? 'student' : 'students'}{loading && ' — updating…'}</p>
          {result.items.length === 0 ? (
            <Empty><p>No students match every filter. Remove a skill or lower the level.</p></Empty>
          ) : (
            <div className="people">
              {result.items.map((u) => (
                <PersonRow
                  key={u.id}
                  user={u}
                  highlightSkills={f.skills}
                  side={<><span className="faint">Year {u.yearOfStudy ?? '–'}{u.lookingFor?.length ? `, wants ${u.lookingFor.map((x) => x.toLowerCase()).join(' / ')}` : ''}</span><PersonActions user={u} invite /></>}
                />
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
