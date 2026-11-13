import { Link } from 'react-router-dom';
import { useQuery } from '@apollo/client/react';
import { STUDENT_DASHBOARD } from '../../graphql/operations.js';
import { JoinButton } from '../Projects.jsx';
import { Avatar, Loading, ErrorNote, Status, Stat, Meter, VerifiedBadge, UserLink, Slider, firstName, timeAgo } from '../../components/ui.jsx';
import { PersonActions } from '../../components/social.jsx';
import Hero from '../../components/Hero.jsx';

/** What a student needs for matching to work, in the order it matters. */
function profileChecks(me) {
  return [
    ['Add at least 3 skills', me.skills.length >= 3],
    ['Add 2+ research interests', me.interests.length >= 2],
    ['Choose your department', !!me.department],
    ['Set your program and year', !!me.program && !!me.yearOfStudy],
    ['Say what you are looking for', me.lookingFor.length > 0],
    ['Write a short bio', (me.bio ?? '').trim().length >= 20],
  ];
}

function ProfileStrength({ me }) {
  const checks = profileChecks(me);
  const done = checks.filter(([, ok]) => ok).length;
  if (done === checks.length) return null;
  return (
    <section className="panel callout">
      <div className="panel-title">
        <h3>Your profile is {Math.round((done / checks.length) * 100)}% complete</h3>
        <Link className="btn btn-primary btn-sm" to="/profile/edit">Complete profile</Link>
      </div>
      <Meter value={done / checks.length} label="Profile completeness" />
      <p className="faint" style={{ margin: '10px 0 6px' }}>Matches and opening alerts are built from your skills and interests. Still to do:</p>
      <ul className="todo">
        {checks.filter(([, ok]) => !ok).map(([label]) => <li key={label}>{label}</li>)}
      </ul>
    </section>
  );
}

export default function StudentDashboard() {
  const { data, loading, error } = useQuery(STUDENT_DASHBOARD, { fetchPolicy: 'cache-and-network' });
  if (loading && !data) return <Loading what="Loading your dashboard" />;
  if (error && !data) return <ErrorNote error={error} />;
  const { me, recommendedMentors: mentors, recommendedProjects: projects, myJoinRequests: requests, labs, invites } = data;

  const pending = requests.filter((r) => r.status === 'PENDING');
  const accepted = requests.filter((r) => r.status === 'ACCEPTED');
  // Short terms like "r" or "c" would substring-match everything, so only compare 3+ letter terms.
  const myAreas = [...new Set([...me.interests, ...me.skills.map((s) => s.name)])].filter((t) => t.length >= 3);
  const fittingLabs = labs
    .map((l) => ({ ...l, overlap: l.researchAreas.filter((a) => myAreas.some((m) => a.includes(m) || m.includes(a))) }))
    .filter((l) => l.overlap.length > 0)
    .sort((a, b) => b.overlap.length - a.overlap.length || b.openSlots - a.openSlots)
    .slice(0, 5);

  return (
    <>
      <Hero
        title={<>Hi, {firstName(me.name)} <span className="wave" aria-hidden="true">👋</span></>}
        sub={[me.program && `${me.program}${me.yearOfStudy ? `, year ${me.yearOfStudy}` : ''}`, me.department?.name].filter(Boolean).join(' · ') || 'Welcome to ResearchMesh.'}
        words={me.interests.length ? me.interests : ['research', 'mentors', 'teammates', 'projects']}
        lead="Find people working on"
      >
        <Link className="btn btn-primary" to="/teammates">Find teammates</Link>
        <Link className="btn" to="/discover">Search faculty</Link>
      </Hero>

      {invites.length > 0 && (
        <div className="banner">
          <b>{invites.length === 1 ? `${invites[0].requester.name} invited you to join “${invites[0].project?.title}”.` : `You have ${invites.length} team invites.`}</b>{' '}
          <Link to="/applications?tab=invites">Review invites</Link>
        </div>
      )}

      <ProfileStrength me={me} />

      <div className="stats" style={{ margin: '16px 0' }}>
        <Stat value={me.lab ? '✓' : '—'} label={me.lab ? `Member of ${me.lab.name}` : 'Not in a lab yet'} to={me.lab ? undefined : '/labs'} />
        <Stat value={pending.length} label="applications waiting" to="/applications" />
        <Stat value={accepted.length} label="accepted" to="/applications" />
        <Stat value={projects.length} label="open projects that fit you" to="/projects" />
        <Stat value={fittingLabs.length} label="labs with room in your areas" to="/labs" />
      </div>

      <div className="two-col">
        <div>
          <section className="panel">
            <div className="panel-title"><h3>Your top mentor matches</h3><Link to="/matches">See all and tune</Link></div>
            {mentors.length === 0 && <p className="faint">Add skills and interests to your profile to get matches.</p>}
            {mentors.length > 0 && (
              <Slider label="Top mentor matches">
                {mentors.map((m) => (
                  <article key={m.faculty.id} className="slide-card">
                    <div className="ring" style={{ '--p': m.score }} aria-label={`${Math.round(m.score * 100)} percent match`}>
                      <span>{Math.round(m.score * 100)}<small>%</small></span>
                    </div>
                    <Avatar user={m.faculty} />
                    <div className="slide-name"><UserLink user={m.faculty} /> <VerifiedBadge user={m.faculty} /></div>
                    <div className="faint">{[m.faculty.title, m.faculty.department?.code].filter(Boolean).join(' · ')}</div>
                    {m.faculty.lab && <div className="slots">{m.faculty.lab.openSlots > 0 ? <><strong>{m.faculty.lab.openSlots}</strong> open in {m.faculty.lab.name}</> : `${m.faculty.lab.name} is full`}</div>}
                    <ul className="reasons">{m.reasons.slice(0, 2).map((r) => <li key={r}>{r}</li>)}</ul>
                    <PersonActions user={m.faculty} />
                  </article>
                ))}
              </Slider>
            )}
          </section>

          <section className="panel">
            <div className="panel-title"><h3>Projects that fit your skills</h3><Link to="/projects">Browse all</Link></div>
            {projects.length === 0 && <p className="faint">No open project needs your current skills. Add more skills, or browse all projects.</p>}
            {projects.length > 0 && (
              <Slider label="Projects that fit your skills">
                {projects.map(({ project: p, score, reasons }) => (
                  <article key={p.id} className="slide-card project-slide">
                    <div className="spread"><Status value={p.status} /><span className="fit-pill">{Math.round(score * 100)}% fit</span></div>
                    <Link to={`/projects/${p.id}`} className="slide-title">{p.title}</Link>
                    <div className="faint">{p.owner.name}{p.lab ? ` · ${p.lab.name}` : ''}</div>
                    <div className="chips">{p.requiredSkills.slice(0, 4).map((s) => <span key={s} className="chip">{s}</span>)}</div>
                    <div className="faint">{reasons.join(' · ')}</div>
                    <div className="spread" style={{ marginTop: 'auto' }}>
                      <span className="faint">{p.seatsLeft} seat{p.seatsLeft === 1 ? '' : 's'} left</span>
                      <JoinButton project={p} />
                    </div>
                  </article>
                ))}
              </Slider>
            )}
          </section>
        </div>

        <aside>
          <section className="panel">
            <div className="panel-title"><h3>My applications</h3><Link to="/applications">All</Link></div>
            {requests.length === 0 && <p className="faint">You haven't applied anywhere yet.</p>}
            {requests.slice(0, 6).map((r) => (
              <div key={r.id} className="spread list-row">
                <div>
                  {r.project ? <Link to={`/projects/${r.project.id}`}>{r.project.title}</Link> : <strong>{r.lab?.name}</strong>}
                  <div className="faint">{r.recipient.name}, {timeAgo(r.createdAt)}</div>
                </div>
                <Status value={r.status} />
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-title"><h3>Labs with openings in your areas</h3><Link to="/labs">All labs</Link></div>
            {me.lab && <p className="faint">You're already in {me.lab.name}. Lab requests are closed while you're a member.</p>}
            {!me.lab && fittingLabs.length === 0 && <p className="faint">None right now. We'll notify you when a matching lab opens a slot.</p>}
            {!me.lab && fittingLabs.map((l) => (
              <div key={l.id} className="list-row">
                <div>
                  <strong>{l.name}</strong> <span className="faint">{l.department.code}</span>
                  <div className="faint">Head: {l.head.name} · <span style={{ color: 'var(--moss-ink)' }}>{l.openSlots} open</span></div>
                  <div className="chips">{l.overlap.map((a) => <span key={a} className="chip hit">{a}</span>)}</div>
                </div>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
