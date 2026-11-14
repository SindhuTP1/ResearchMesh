import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { FACULTY_DASHBOARD, RECOMMENDED_STUDENTS, UPDATE_PROJECT } from '../../graphql/operations.js';
import { RequestActions } from '../MyLab.jsx';
import { Avatar, Loading, ErrorNote, Status, Stat, Skills, UserLink, money, firstName, timeAgo, useToast, errorText } from '../../components/ui.jsx';
import Hero from '../../components/Hero.jsx';
import PeopleSearch from '../../components/PeopleSearch.jsx';

const THIS_YEAR = new Date().getFullYear();

function VerificationBanner({ me }) {
  if (me.verification === 'PENDING') {
    return (
      <div className="banner">
        <b>Your faculty account is waiting for admin verification.</b> Everything works in the meantime; students
        will see an “Unverified” tag next to your name until an admin approves you.
      </div>
    );
  }
  if (me.verification === 'REJECTED') {
    return <div className="banner danger"><b>Your faculty verification was declined.</b> Please contact the platform admin to sort it out.</div>;
  }
  return null;
}

/** Papers per year for the last six years, as labelled bars. */
function ResearchOutput({ publications }) {
  const years = Array.from({ length: 6 }, (_, i) => THIS_YEAR - 5 + i);
  const counts = years.map((y) => publications.filter((p) => p.year === y).length);
  const max = Math.max(1, ...counts);
  const keywords = Object.entries(
    publications.filter((p) => p.year >= THIS_YEAR - 2).flatMap((p) => p.keywords).reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <section className="panel">
      <div className="panel-title"><h3>Research output</h3><Link to="/publications">Manage</Link></div>
      <div className="year-bars" role="list" aria-label="Publications per year">
        {years.map((y, i) => (
          <div key={y} className="year-bar" role="listitem" aria-label={`${y}: ${counts[i]} papers`}>
            <span className="y">{y}</span>
            <span className="track"><span style={{ width: `${(counts[i] / max) * 100}%` }} /></span>
            <span className="n">{counts[i]}</span>
          </div>
        ))}
      </div>
      {keywords.length > 0 && (
        <>
          <p className="faint" style={{ marginTop: 12 }}>What students see you working on now:</p>
          <div className="chips">{keywords.map(([k]) => <span key={k} className="chip interest">{k}</span>)}</div>
        </>
      )}
      {publications.length === 0 && <p className="faint" style={{ marginTop: 8 }}>No publications yet. Students filter by recent papers, so add yours.</p>}
    </section>
  );
}

function SuggestedStudents({ project }) {
  const { data, loading } = useQuery(RECOMMENDED_STUDENTS, { variables: { projectId: project.id } });
  const list = data?.recommendedStudentsForProject.filter((m) => m.score > 0).slice(0, 4) ?? [];
  return (
    <section className="panel">
      <div className="panel-title">
        <h3>Students to invite</h3>
        <Link to={`/projects/${project.id}`}>All for this project</Link>
      </div>
      <p className="faint" style={{ marginBottom: 6 }}>Best fit for <strong>{project.title}</strong>, by required-skill coverage.</p>
      {loading && <Loading />}
      {!loading && list.length === 0 && <p className="faint">No students have these skills yet.</p>}
      {list.map((m) => (
        <div key={m.student.id} className="mini-match">
          <Avatar user={m.student} />
          <div>
            <UserLink user={m.student} />
            <div className="faint">{[m.student.program, m.student.department?.code, m.student.lab ? m.student.lab.name : 'no lab yet'].filter(Boolean).join(', ')}</div>
            <div className="faint">{m.reasons.join(' · ')}</div>
          </div>
          <div className="score">{Math.round(m.score * 100)}<small>%</small></div>
        </div>
      ))}
    </section>
  );
}

function ProjectRow({ p }) {
  const toast = useToast();
  const [update, { loading }] = useMutation(UPDATE_PROJECT);
  const flip = () => update({ variables: { id: p.id, input: { isOpen: !p.isOpen } } }).catch((e) => toast({ kind: 'error', title: 'Not saved', body: errorText(e) }));
  return (
    <div className="list-row spread">
      <div>
        <Link to={`/projects/${p.id}`} className="serif" style={{ fontWeight: 600 }}>{p.title}</Link>
        <div className="faint"><Status value={p.status} /> · {p.members.length} of {p.maxMembers} people · {p.isOpen ? 'taking members' : 'closed'}</div>
      </div>
      <button className="btn btn-sm" disabled={loading} onClick={flip}>{p.isOpen ? 'Close' : 'Reopen'}</button>
    </div>
  );
}

export default function FacultyDashboard() {
  const { data, loading, error, refetch } = useQuery(FACULTY_DASHBOARD, { fetchPolicy: 'cache-and-network' });
  const [showAll, setShowAll] = useState(false);
  if (loading && !data) return <Loading what="Loading your dashboard" />;
  if (error && !data) return <ErrorNote error={error} />;
  const { me, myJoinRequests: pending, projects } = data;
  const openProjects = projects.filter((p) => p.isOpen);
  const firstOpen = openProjects.find((p) => p.requiredSkills.length > 0);
  const shown = showAll ? pending : pending.slice(0, 4);

  return (
    <>
      <Hero
        title={<>Welcome, {me.name.startsWith('Dr.') ? `Dr. ${me.name.split(/\s+/).at(-1)}` : firstName(me.name)}</>}
        sub={[me.title, me.department?.name, me.lab?.name].filter(Boolean).join(' · ')}
        words={me.lab?.researchAreas?.length ? me.lab.researchAreas : ['your lab', 'your projects', 'your students']}
        lead="Growing"
      >
        <Link className="btn btn-primary" to="/my-projects?new=1">Post a project</Link>
        <Link className="btn" to="/students">Find students</Link>
      </Hero>

      <PeopleSearch />

      <VerificationBanner me={me} />

      {!me.lab && (
        <section className="panel callout" style={{ marginBottom: 16 }}>
          <div className="spread">
            <div>
              <h3>Set up your lab</h3>
              <p className="faint">Labs with open slots appear in student searches, and matching students are notified when you open a place.</p>
            </div>
            <Link className="btn btn-primary" to="/my-lab">Create lab</Link>
          </div>
        </section>
      )}

      <div className="stats" style={{ marginBottom: 16 }}>
        <Stat value={pending.length} label="requests waiting for you" to="/requests" tone={pending.length ? 'attention' : ''} />
        {me.lab && <Stat value={`${me.lab.memberCount}/${me.lab.capacity}`} label={`lab members, ${me.lab.openSlots} open`} to="/my-lab" />}
        <Stat value={openProjects.length} label={`open projects (of ${projects.length})`} to="/my-projects" />
        <Stat value={me.recentPublicationCount} label="papers in the last 2 years" to="/publications" />
        {me.lab && <Stat value={money(me.lab.totalActiveFunding)} label="active funding" to="/my-lab" />}
      </div>

      <div className="two-col">
        <div>
          <section className="panel">
            <div className="panel-title"><h3>Waiting for your answer</h3><Link to="/requests">All requests</Link></div>
            {pending.length === 0 && <p className="faint">Nothing pending. New requests appear here the moment they're sent.</p>}
            {shown.map((r) => (
              <div className="request" key={r.id}>
                <div>
                  <UserLink user={r.requester} /> <span className="faint">{[r.requester.program, r.requester.department?.code].filter(Boolean).join(', ')} · {timeAgo(r.createdAt)}</span>
                  <div className="faint">Wants to join {r.project ? <>the project <strong>{r.project.title}</strong></> : <>your lab</>}</div>
                  <Skills skills={r.requester.skills} max={5} />
                  {r.message && <blockquote>{r.message}</blockquote>}
                </div>
                <RequestActions request={r} refetch={refetch} />
              </div>
            ))}
            {pending.length > 4 && <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show ${pending.length - 4} more`}</button>}
          </section>

          <section className="panel">
            <div className="panel-title"><h3>Your projects</h3><Link to="/my-projects">Manage</Link></div>
            {projects.length === 0 && <p className="faint">You haven't posted a project yet. <Link to="/my-projects?new=1">Post one</Link> and matching students are notified.</p>}
            {projects.slice(0, 6).map((p) => <ProjectRow key={p.id} p={p} />)}
          </section>
        </div>

        <aside>
          <ResearchOutput publications={me.publications} />
          {firstOpen && <SuggestedStudents project={firstOpen} />}
        </aside>
      </div>
    </>
  );
}
