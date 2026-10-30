import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { PROJECT_DETAIL, RECOMMENDED_STUDENTS, UPDATE_PROJECT } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { JoinButton } from './Projects.jsx';
import MatchBar from '../components/MatchBar.jsx';
import PersonRow from '../components/PersonRow.jsx';
import { Loading, ErrorNote, Status, UserLink } from '../components/ui.jsx';

const PROJECT_WEIGHTS = { skill: 0.7, interest: 0.3, recency: 0, availability: 0 };

function Recommendations({ projectId, requiredSkills }) {
  const { data, loading, error } = useQuery(RECOMMENDED_STUDENTS, { variables: { projectId } });
  return (
    <section className="panel">
      <div className="panel-title">
        <h3>Students who fit</h3>
        <span className="faint">Ranked by required-skill coverage, then topic fit</span>
      </div>
      <ErrorNote error={error} />
      {loading && <Loading />}
      {data?.recommendedStudentsForProject.map((m) => (
        <div className="match-row" key={m.student.id}>
          <PersonRow user={m.student} highlightSkills={requiredSkills} />
          <div style={{ paddingTop: 16 }}>
            <MatchBar score={m.score} breakdown={m.breakdown} weights={PROJECT_WEIGHTS} reasons={m.reasons} />
          </div>
        </div>
      ))}
    </section>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error } = useQuery(PROJECT_DETAIL, { variables: { id } });
  const [update, { loading: saving }] = useMutation(UPDATE_PROJECT);
  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const p = data.project;
  if (!p) return <p>Project not found.</p>;
  const isOwner = p.owner.id === user?.id;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="faint"><Link to="/projects">Projects</Link></p>
          <h1>{p.title}</h1>
          <p className="muted">Led by <UserLink user={p.owner} />{p.lab && <>, <Link to={`/labs`}>{p.lab.name}</Link></>}</p>
        </div>
        <JoinButton project={p} />
      </div>

      <div className="two-col">
        <div>
          <section className="panel">
            <p>{p.description || 'No description yet.'}</p>
            <div className="chips" style={{ marginTop: 14 }}>
              {p.requiredSkills.map((s) => <span key={s} className="chip">{s}</span>)}
              {p.tags.map((t) => <span key={t} className="chip interest">{t}</span>)}
            </div>
          </section>
          {isOwner && <Recommendations projectId={p.id} requiredSkills={p.requiredSkills} />}
        </div>
        <aside>
          <section className="panel">
            <dl className="dl">
              <dt>Status</dt><dd><Status value={p.status} /></dd>
              <dt>Seats</dt><dd>{p.seatsLeft} of {p.maxMembers} free</dd>
              <dt>Taking members</dt><dd>{p.isOpen ? 'Yes' : 'No'}</dd>
            </dl>
            {isOwner && (
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn btn-sm" disabled={saving} onClick={() => update({ variables: { id: p.id, input: { isOpen: !p.isOpen } } })}>
                  {p.isOpen ? 'Stop taking members' : 'Start taking members'}
                </button>
                <select
                  aria-label="Project status" value={p.status} style={{ width: 'auto' }}
                  onChange={(e) => update({ variables: { id: p.id, input: { status: e.target.value } } })}
                >
                  {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
                </select>
              </div>
            )}
          </section>
          <section className="panel">
            <h3 style={{ marginBottom: 10 }}>Team</h3>
            {p.members.map((m) => (
              <div key={m.id} className="spread" style={{ padding: '6px 0' }}>
                <UserLink user={m} />
                <span className="faint">{m.role === 'FACULTY' ? 'Faculty' : m.program}{m.department ? `, ${m.department.code}` : ''}</span>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
