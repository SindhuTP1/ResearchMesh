import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { FIND_TEAMMATES, FILTER_OPTIONS, DEPARTMENTS, MY_PROJECTS, OPEN_PROJECT_CHAT } from '../../graphql/operations.js';
import { NewProject } from '../Projects.jsx';
import { PersonActions } from '../../components/social.jsx';
import { Avatar, Loading, ErrorNote, Empty, ChipPicker, Skills, Interests, useToast, errorText } from '../../components/ui.jsx';

const PAGE = 15;
const EMPTY = { interests: [], skills: [], dept: '', years: [], lookingForTeam: false, excludeConnected: false, name: '' };
const PARTS = [
  ['interest', 'Shared interests', 'var(--m-interest)', 0.55],
  ['skill', 'Shared skills', 'var(--m-skill)', 0.25],
  ['complement', 'Fills your gaps', 'var(--m-availability)', 0.2],
];

function FitBar({ m }) {
  return (
    <div className="fit">
      <div className="match-score" aria-label={`Fit ${Math.round(m.score * 100)} percent`}>{Math.round(m.score * 100)}<small>%</small></div>
      <div>
        <div className="match-bar" role="img" aria-label={PARTS.map(([k, l]) => `${l} ${Math.round(m.breakdown[k] * 100)}%`).join(', ')}>
          {PARTS.map(([k, l, c, w]) => <span key={k} title={`${l}: ${Math.round(m.breakdown[k] * 100)}%`} style={{ width: `${w * m.breakdown[k] * 100}%`, background: c }} />)}
        </div>
        <ul className="reasons">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
    </div>
  );
}

/** The student's own teams: student-led projects, each with a team chat. */
function MyTeams({ onStart }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { data } = useQuery(MY_PROJECTS, { fetchPolicy: 'cache-and-network' });
  const [openChat] = useMutation(OPEN_PROJECT_CHAT);
  const teams = data?.projects ?? [];
  return (
    <section className="panel">
      <div className="panel-title">
        <h3>My teams</h3>
        <button className="btn btn-primary btn-sm" onClick={onStart}>Start a team</button>
      </div>
      {teams.length === 0 && <p className="faint">Start a team around an idea, then invite the people below. Everyone you add gets a shared team chat.</p>}
      {teams.map((p) => (
        <div key={p.id} className="list-row">
          <div>
            <Link to={`/projects/${p.id}`} className="serif" style={{ fontWeight: 600 }}>{p.title}</Link>
            <div className="faint">{p.members.length} of {p.maxMembers} · {p.isOpen ? 'looking for teammates' : 'team closed'}</div>
            <div className="chips">{p.tags.map((t) => <span key={t} className="chip interest">{t}</span>)}</div>
          </div>
          <button className="btn btn-sm" onClick={() => openChat({ variables: { projectId: p.id } }).then(({ data: d }) => navigate(`/messages/${d.openProjectConversation.id}`)).catch((e) => toast({ kind: 'error', title: 'Chat not opened', body: errorText(e) }))}>Team chat</button>
        </div>
      ))}
    </section>
  );
}

export default function FindTeammates() {
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(0);
  const [starting, setStarting] = useState(false);
  const { data: opts } = useQuery(FILTER_OPTIONS, { variables: { role: 'STUDENT' } });
  const { data: deptData } = useQuery(DEPARTMENTS);
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setPage(0); };
  const input = {
    interests: f.interests.length ? f.interests : null,
    skills: f.skills.length ? f.skills : null,
    departmentId: f.dept || null,
    years: f.years.length ? f.years : null,
    lookingForTeam: f.lookingForTeam || null,
    excludeConnected: f.excludeConnected || null,
    name: f.name.trim() || null,
    limit: PAGE,
    offset: page * PAGE,
  };
  const { data, loading, error, previousData } = useQuery(FIND_TEAMMATES, { variables: { input } });
  const result = (data ?? previousData)?.findTeammates;
  const o = opts?.filterOptions;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Find teammates</h1>
          <p className="muted">Students across every department, ranked by how much of your domain they share, and by the skills they'd bring that you don't have. Connect, then invite them to a team.</p>
        </div>
      </div>

      {starting && <div style={{ marginBottom: 16 }}><NewProject onDone={() => setStarting(false)} /></div>}
      <MyTeams onStart={() => setStarting(true)} />

      <section className="panel filters" style={{ marginTop: 16 }}>
        <div className="stack">
          <ChipPicker label="Domain / interests (any of)" options={o?.areas ?? []} selected={f.interests} onChange={(interests) => set({ interests })} initial={18} placeholder="Find a domain…" />
          <ChipPicker label="Must know (all of)" options={o?.skills ?? []} selected={f.skills} onChange={(skills) => set({ skills })} initial={18} placeholder="Find a skill…" />
          <div className="form-grid">
            <label className="field">Name<input value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="field">Department
              <select value={f.dept} onChange={(e) => set({ dept: e.target.value })}>
                <option value="">All departments</option>
                {deptData?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <span className="picker-label">Year</span>
            {[1, 2, 3, 4, 5].map((y) => (
              <label key={y} className="check"><input type="checkbox" checked={f.years.includes(y)} onChange={() => set({ years: f.years.includes(y) ? f.years.filter((x) => x !== y) : [...f.years, y] })} />{y}</label>
            ))}
          </div>
          <div className="row">
            <label className="check"><input type="checkbox" checked={f.lookingForTeam} onChange={(e) => set({ lookingForTeam: e.target.checked })} />Only people looking for collaborators or a project</label>
            <label className="check"><input type="checkbox" checked={f.excludeConnected} onChange={(e) => set({ excludeConnected: e.target.checked })} />Hide people I'm already connected with</label>
            {JSON.stringify(f) !== JSON.stringify(EMPTY) && <button type="button" className="btn btn-sm" onClick={() => set(EMPTY)}>Clear filters</button>}
          </div>
        </div>
      </section>

      <ErrorNote error={error} />
      {!result && loading && <Loading what="Finding teammates" />}
      {result && (
        <>
          <p className="results-meta">{result.totalCount} {result.totalCount === 1 ? 'student' : 'students'}{loading && ' — updating…'}</p>
          {result.items.length === 0 ? <Empty><p>No students match every filter.</p></Empty> : (
            <div className="people">
              {result.items.map((m) => {
                const u = m.student;
                return (
                  <div key={u.id} className="teammate">
                    <Avatar user={u} />
                    <div>
                      <Link className="name" to={`/people/${u.id}`}>{u.name}</Link>
                      <div className="sub">{[u.program && `${u.program}${u.yearOfStudy ? `, year ${u.yearOfStudy}` : ''}`, u.department?.code, u.lab?.name].filter(Boolean).join(' · ')}{u.lookingFor?.includes('COLLABORATOR') && <span className="status accepted" style={{ marginLeft: 8 }}>Open to teaming up</span>}</div>
                      <Interests items={u.interests} highlight={m.sharedInterests[0] ?? ''} />
                      <Skills skills={u.skills} highlight={m.newSkills} max={6} />
                    </div>
                    <div className="teammate-side">
                      <FitBar m={m} />
                      <PersonActions user={u} invite />
                    </div>
                  </div>
                );
              })}
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
