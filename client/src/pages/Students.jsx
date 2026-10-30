import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { SEARCH_STUDENTS, DEPARTMENTS } from '../graphql/operations.js';
import PersonRow from '../components/PersonRow.jsx';
import { Loading, ErrorNote, Empty, csv } from '../components/ui.jsx';

/** Faculty-only: "students with python + genomics who aren't attached to a lab yet". */
export default function Students() {
  const [skills, setSkills] = useState('python, genomics');
  const [minLevel, setMinLevel] = useState('');
  const [unattached, setUnattached] = useState(true);
  const [interests, setInterests] = useState('');
  const [dept, setDept] = useState('');
  const { data: deptData } = useQuery(DEPARTMENTS);

  const skillList = csv(skills);
  const input = {
    skills: skillList.length ? skillList : null,
    minSkillLevel: minLevel ? Number(minLevel) : null,
    unattached: unattached || null,
    interests: csv(interests).length ? csv(interests) : null,
    departmentId: dept || null,
    limit: 30,
  };
  const { data, loading, error, previousData } = useQuery(SEARCH_STUDENTS, { variables: { input } });
  const result = (data ?? previousData)?.searchStudents;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Find students</h1>
          <p className="muted">Find students in any department with the skills your work needs. Students see their own email; you see contact details here.</p>
        </div>
      </div>

      <form className="query-sentence" onSubmit={(e) => e.preventDefault()} aria-label="Student search">
        <span>Students who know</span>
        <input type="text" aria-label="Skills" value={skills} placeholder="any skills" onChange={(e) => setSkills(e.target.value)} style={{ minWidth: 200 }} />
        <span>at level</span>
        <select aria-label="Minimum level" value={minLevel} onChange={(e) => setMinLevel(e.target.value)}>
          <option value="">any</option>
          {[2, 3, 4, 5].map((l) => <option key={l} value={l}>{l}+</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={unattached} onChange={(e) => setUnattached(e.target.checked)} />
          and aren't in a lab yet
        </label>
      </form>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <label className="field">Interested in (any of)
          <input value={interests} placeholder="single-cell, cancer biology" onChange={(e) => setInterests(e.target.value)} />
        </label>
        <label className="field">Department
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">All departments</option>
            {deptData?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      </div>

      <ErrorNote error={error} />
      {!result && loading && <Loading what="Searching" />}
      {result && (
        <>
          <p className="results-meta">{result.totalCount} {result.totalCount === 1 ? 'student' : 'students'}{loading && ' — updating…'}</p>
          {result.items.length === 0 ? (
            <Empty><p>No students have all of those skills. Remove one or lower the level.</p></Empty>
          ) : (
            <div className="people">
              {result.items.map((u) => (
                <PersonRow
                  key={u.id}
                  user={u}
                  highlightSkills={skillList}
                  side={<span className="faint">Year {u.yearOfStudy ?? '–'}{u.lookingFor?.length ? `, wants ${u.lookingFor.map((x) => x.toLowerCase()).join(' / ')}` : ''}</span>}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
