import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { SEARCH_FACULTY, DEPARTMENTS, FILTER_OPTIONS } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import PersonRow from '../components/PersonRow.jsx';
import { PersonActions } from '../components/social.jsx';
import { Loading, ErrorNote, Empty, ChipPicker } from '../components/ui.jsx';

const PAGE = 15;
const SORTS = [
  ['RELEVANCE', 'Most active first'],
  ['RECENT_PAPERS', 'Most recent papers'],
  ['OPEN_SLOTS', 'Most open lab slots'],
  ['RECENTLY_ACTIVE', 'Recently active on ResearchMesh'],
  ['NAME', 'Name (A–Z)'],
];
const QUICK_FIELDS = ['nlp', 'cloud', 'devops', 'java', 'spring boot', 'chemistry', 'automation', 'robotics', 'genomics', 'cybersecurity', 'iot', 'electric vehicles'];

const EMPTY = { area: '', areas: [], skills: [], matchAnySkill: false, recentOnly: false, years: 2, openOnly: false, hasLab: false, verifiedOnly: false, titles: [], dept: '', minPapers: '', name: '', sortBy: 'RELEVANCE' };

/**
 * Faculty search. The headline query still reads as a sentence —
 * "Faculty working on [nlp] who published in the last [2] years, with an open lab slot" —
 * with a full filter panel underneath built from the values that exist in the data.
 */
export default function Discover() {
  const { isFaculty } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(true);
  const { data: deptData } = useQuery(DEPARTMENTS);
  const { data: opts } = useQuery(FILTER_OPTIONS, { variables: { role: 'FACULTY' } });
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setPage(0); };

  const input = {
    area: f.area.trim() || null,
    areas: f.areas.length ? f.areas : null,
    skills: f.skills.length ? f.skills : null,
    matchAnySkill: f.matchAnySkill || null,
    publishedWithinYears: f.recentOnly ? Number(f.years) || 2 : null,
    hasOpenSlots: f.openOnly || null,
    hasLab: f.hasLab || null,
    verifiedOnly: f.verifiedOnly || null,
    titles: f.titles.length ? f.titles : null,
    departmentId: f.dept || null,
    minRecentPublications: f.minPapers ? Number(f.minPapers) : null,
    name: f.name.trim() || null,
    sortBy: f.sortBy,
    limit: PAGE,
    offset: page * PAGE,
  };
  const { data, loading, error, previousData } = useQuery(SEARCH_FACULTY, { variables: { input } });
  const result = (data ?? previousData)?.searchFaculty;
  const o = opts?.filterOptions;
  const activeCount = [f.area.trim(), f.areas.length, f.skills.length, f.recentOnly, f.openOnly, f.hasLab, f.verifiedOnly, f.titles.length, f.dept, f.minPapers, f.name.trim()].filter(Boolean).length;
  const highlight = [f.area.trim(), ...f.areas].filter(Boolean)[0] ?? '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isFaculty ? 'Faculty directory' : 'Find faculty'}</h1>
          <p className="muted">
            {isFaculty
              ? 'Find collaborators across departments by what they are publishing now.'
              : 'Filter by what people are publishing now, not what their department page said years ago.'}
          </p>
        </div>
      </div>

      <form className="query-sentence" onSubmit={(e) => e.preventDefault()} aria-label="Faculty search">
        <span>Faculty working on</span>
        <input type="text" aria-label="Research area" list="area-suggestions" value={f.area} placeholder="any area" onChange={(e) => set({ area: e.target.value })} />
        <datalist id="area-suggestions">{o?.areas.slice(0, 60).map((a) => <option key={a.value} value={a.value} />)}</datalist>
        <label className="check">
          <input type="checkbox" checked={f.recentOnly} onChange={(e) => set({ recentOnly: e.target.checked })} />
          who published in the last
        </label>
        <input type="number" min={1} max={10} aria-label="Years" value={f.years} disabled={!f.recentOnly} onChange={(e) => set({ years: e.target.value })} />
        <span>years</span>
        <label className="check">
          <input type="checkbox" checked={f.openOnly} onChange={(e) => set({ openOnly: e.target.checked })} />
          with an open lab slot
        </label>
      </form>

      <div className="quick-fields" aria-label="Popular fields">
        <span className="faint">Popular:</span>
        {QUICK_FIELDS.map((q) => (
          <button key={q} type="button" className={`chip-toggle ${f.area === q ? 'on' : ''}`} aria-pressed={f.area === q} onClick={() => set({ area: f.area === q ? '' : q })}>{q}</button>
        ))}
      </div>

      <section className="panel filters">
        <div className="spread">
          <button type="button" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
            {showFilters ? '▾' : '▸'} More filters{activeCount > 0 && ` (${activeCount} active)`}
          </button>
          <div className="row">
            <label className="field inline">Sort
              <select value={f.sortBy} onChange={(e) => set({ sortBy: e.target.value })}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {activeCount > 0 && <button type="button" className="btn btn-sm" onClick={() => set(EMPTY)}>Clear all</button>}
          </div>
        </div>

        {showFilters && (
          <div className="stack" style={{ marginTop: 14 }}>
            <div className="form-grid">
              <label className="field">Name<input value={f.name} placeholder="e.g. Rao" onChange={(e) => set({ name: e.target.value })} /></label>
              <label className="field">Department
                <select value={f.dept} onChange={(e) => set({ dept: e.target.value })}>
                  <option value="">All departments</option>
                  {deptData?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="field">Papers in the last 2 years
                <select value={f.minPapers} onChange={(e) => set({ minPapers: e.target.value })}>
                  <option value="">Any</option>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}
                </select>
              </label>
            </div>

            <ChipPicker label="Research fields (any of)" options={o?.areas ?? []} selected={f.areas} onChange={(areas) => set({ areas })} initial={18} placeholder="Find a field…" />

            <div>
              <ChipPicker label="Skills" options={o?.skills ?? []} selected={f.skills} onChange={(skills) => set({ skills })} initial={18} placeholder="Find a skill…" />
              {f.skills.length > 1 && (
                <div className="row" style={{ marginTop: 8 }} role="radiogroup" aria-label="Skill matching">
                  <label className="check"><input type="radio" checked={!f.matchAnySkill} onChange={() => set({ matchAnySkill: false })} />Has all of them</label>
                  <label className="check"><input type="radio" checked={f.matchAnySkill} onChange={() => set({ matchAnySkill: true })} />Has any of them</label>
                </div>
              )}
            </div>

            <ChipPicker label="Designation" options={(o?.titles ?? []).map((t) => ({ value: t }))} selected={f.titles} onChange={(titles) => set({ titles })} />

            <div className="row">
              <label className="check"><input type="checkbox" checked={f.hasLab} onChange={(e) => set({ hasLab: e.target.checked })} />Heads a lab</label>
              <label className="check"><input type="checkbox" checked={f.verifiedOnly} onChange={(e) => set({ verifiedOnly: e.target.checked })} />Verified faculty only</label>
            </div>
          </div>
        )}
      </section>

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
              <p>Try a broader field, a longer publishing window, or include full labs.</p>
            </Empty>
          ) : (
            <div className="people">
              {result.items.map((u) => (
                <PersonRow key={u.id} user={u} highlightArea={highlight} highlightSkills={f.skills} side={<PersonActions user={u} />} />
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
