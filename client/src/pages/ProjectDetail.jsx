import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { PROJECT_DETAIL, RECOMMENDED_STUDENTS, UPDATE_PROJECT, OPEN_PROJECT_CHAT, FIND_TEAMMATES, INVITE_TO_PROJECT } from '../graphql/operations.js';
import { PersonActions } from '../components/social.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { JoinButton } from './Projects.jsx';
import MatchBar from '../components/MatchBar.jsx';
import PersonRow from '../components/PersonRow.jsx';
import { Loading, ErrorNote, Status, UserLink, useToast, errorText } from '../components/ui.jsx';

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
          <PersonRow user={m.student} highlightSkills={requiredSkills} side={<PersonActions user={m.student} invite />} />
          <div style={{ paddingTop: 16 }}>
            <MatchBar score={m.score} breakdown={m.breakdown} weights={PROJECT_WEIGHTS} reasons={m.reasons} />
          </div>
        </div>
      ))}
    </section>
  );
}

/**
 * Owner-only: search any student (name, skill, interest or program) and invite them to THIS project
 * in one click. They get a notification and accept it from their requests; accepting adds them to
 * the team and its chat.
 */
function InviteStudents({ project }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [note, setNote] = useState('');
  const [invited, setInvited] = useState({}); // userId → true, for this visit
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, loading, error } = useQuery(FIND_TEAMMATES, {
    variables: { input: { query: term, limit: 10 } },
    skip: term.length < 2,
  });
  const [invite, { loading: sending }] = useMutation(INVITE_TO_PROJECT, { refetchQueries: ['ProjectDetail'] });
  const memberIds = new Set(project.members.map((m) => m.id));
  const people = (data?.findTeammates.items ?? []).map((m) => m.student).filter((u) => !memberIds.has(u.id));
  const full = project.seatsLeft <= 0;

  const send = async (u) => {
    try {
      await invite({ variables: { projectId: project.id, userId: u.id, message: note.trim() || null } });
      setInvited((x) => ({ ...x, [u.id]: true }));
      toast({ kind: 'ok', title: 'Invite sent', body: `${u.name} will be notified and can accept it from their requests.` });
    } catch (e) {
      if (/already a pending/i.test(errorText(e))) setInvited((x) => ({ ...x, [u.id]: true }));
      toast({ kind: 'error', title: 'Invite not sent', body: errorText(e) });
    }
  };

  return (
    <section className="panel invite-panel">
      <div className="panel-title">
        <h3>Invite students</h3>
        <span className="faint">{project.seatsLeft} {project.seatsLeft === 1 ? 'seat' : 'seats'} free</span>
      </div>
      {!project.isOpen && <p className="faint">This project isn't taking members. Choose “Start taking members” to send invites.</p>}
      {project.isOpen && full && <p className="faint">The team is full. Raise the size or remove someone to invite more people.</p>}
      {project.isOpen && !full && (
        <>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students to invite"
            placeholder="🔎 Search students by name, skill, interest or program" />
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} aria-label="Message with the invite (optional)"
            placeholder="Message with the invite (optional) — e.g. We need help with the ML model" style={{ marginTop: 8 }} />
          <ErrorNote error={error} />
          {term.length < 2 && <p className="faint" style={{ marginTop: 10 }}>Type at least 2 letters to search.</p>}
          {term.length >= 2 && loading && <Loading what="Searching" />}
          {term.length >= 2 && !loading && people.length === 0 && <p className="faint" style={{ marginTop: 10 }}>No students match “{term}”.</p>}
          <div className="invite-results">
            {people.map((u) => (
              <div key={u.id} className="invite-row">
                <div>
                  <UserLink user={u} />
                  <div className="faint">{[u.program && `${u.program}${u.yearOfStudy ? `, year ${u.yearOfStudy}` : ''}`, u.department?.code].filter(Boolean).join(' · ')}</div>
                  <div className="chips">{(u.skills ?? []).slice(0, 5).map((s) => <span key={s.name} className="chip">{s.name}</span>)}</div>
                </div>
                {invited[u.id]
                  ? <span className="status pending">Invited</span>
                  : <button className="btn btn-primary btn-sm" disabled={sending} onClick={() => send(u)}>Invite</button>}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function TeamChatButton({ projectId }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, { loading }] = useMutation(OPEN_PROJECT_CHAT);
  return (
    <button className="btn" disabled={loading} onClick={() => open({ variables: { projectId } })
      .then(({ data }) => navigate(`/messages/${data.openProjectConversation.id}`))
      .catch((e) => toast({ kind: 'error', title: 'Chat not opened', body: errorText(e) }))}>Team chat</button>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { user, isAdmin } = useAuth();
  const { data, loading, error } = useQuery(PROJECT_DETAIL, { variables: { id } });
  const [update, { loading: saving }] = useMutation(UPDATE_PROJECT);
  if (loading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  const p = data.project;
  if (!p) return <p>Project not found.</p>;
  const isOwner = p.owner.id === user?.id;
  const isMember = isOwner || p.members.some((m) => m.id === user?.id);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="faint"><Link to={isAdmin ? '/admin/projects' : user?.role === 'FACULTY' && p.owner.id === user.id ? '/my-projects' : '/projects'}>{isAdmin ? 'Projects & labs' : 'Projects'}</Link></p>
          <h1>{p.title}</h1>
          <p className="muted">Led by <UserLink user={p.owner} />{p.lab && <>, <Link to={`/labs`}>{p.lab.name}</Link></>}</p>
        </div>
        <div className="row">
          {isMember && !isAdmin && <TeamChatButton projectId={p.id} />}
          {!isAdmin && <JoinButton project={p} />}
        </div>
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
          {isOwner && <InviteStudents project={p} />}
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
