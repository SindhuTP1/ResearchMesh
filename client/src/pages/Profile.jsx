import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { USER_PROFILE, CONNECT, ADD_PUBLICATION, MY_PROFILE_EDIT, UPDATE_PROFILE } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Avatar, Skills, Interests, Loading, ErrorNote, Status, UserLink, useToast, errorText, csv, timeAgo } from '../components/ui.jsx';

const THIS_YEAR = new Date().getFullYear();

function AddPublication({ userId }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', venue: '', year: THIS_YEAR, keywords: '' });
  const [add, { loading, error }] = useMutation(ADD_PUBLICATION, { refetchQueries: [{ query: USER_PROFILE, variables: { id: userId } }] });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  if (!open) return <button className="btn btn-sm" onClick={() => setOpen(true)}>Add publication</button>;
  return (
    <form className="stack" style={{ margin: '12px 0' }} onSubmit={async (e) => {
      e.preventDefault();
      const r = await add({ variables: { input: { title: form.title, venue: form.venue, year: Number(form.year), keywords: csv(form.keywords) } } }).catch(() => null);
      if (r) { setOpen(false); setForm({ title: '', venue: '', year: THIS_YEAR, keywords: '' }); }
    }}>
      <label className="field">Title<input required value={form.title} onChange={set('title')} /></label>
      <div className="form-grid">
        <label className="field">Venue<input placeholder="ACL, IEEE Access…" value={form.venue} onChange={set('venue')} /></label>
        <label className="field">Year<input type="number" min={1950} max={THIS_YEAR + 1} value={form.year} onChange={set('year')} /></label>
        <label className="field">Keywords<input placeholder="nlp, retrieval" value={form.keywords} onChange={set('keywords')} /></label>
      </div>
      <ErrorNote error={error} />
      <div className="row"><button className="btn btn-primary btn-sm" disabled={loading}>Save</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

export default function Profile() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, loading, error } = useQuery(USER_PROFILE, { variables: { id } });
  const [connect, { loading: connecting }] = useMutation(CONNECT, { refetchQueries: [{ query: USER_PROFILE, variables: { id } }] });

  if (loading) return <Loading />;
  if (error && !data?.user) return <ErrorNote error={error} />;
  const u = data?.user;
  if (!u) return <p>Person not found.</p>;
  const isMe = u.id === me?.id;
  const alreadyConnected = u.connections.some((c) => c.id === me?.id);

  return (
    <>
      <div className="profile-head">
        <Avatar user={u} size="lg" />
        <div>
          <h1>{u.name}</h1>
          <p className="muted">{[u.title || u.program, u.department?.name].filter(Boolean).join(', ')}</p>
          {u.email && <p className="faint">{u.email}</p>}
          {u.bio && <p style={{ marginTop: 10, maxWidth: '64ch' }}>{u.bio}</p>}
        </div>
        <div className="row">
          {isMe ? <Link className="btn" to="/profile/edit">Edit profile</Link> : alreadyConnected ? <span className="faint">Connected</span> : (
            <button className="btn btn-primary" disabled={connecting} onClick={async () => {
              try { await connect({ variables: { userId: u.id } }); toast({ kind: 'ok', title: 'Connected', body: `${u.name} has been notified.` }); }
              catch (e) { toast({ kind: 'error', title: 'Not connected', body: errorText(e) }); }
            }}>Connect</button>
          )}
        </div>
      </div>

      <div className="two-col">
        <div>
          <section className="panel">
            <h3>Interests and skills</h3>
            <Interests items={u.interests} />
            <Skills skills={u.skills} max={20} />
            {u.interests.length + u.skills.length === 0 && <p className="faint" style={{ marginTop: 8 }}>Nothing listed yet.</p>}
          </section>

          <section className="panel">
            <div className="panel-title">
              <h3>Publications <span className="faint">({u.publicationCount}, {u.recentPublicationCount} in the last 2 years)</span></h3>
              {isMe && <AddPublication userId={u.id} />}
            </div>
            {u.publications.length === 0 && <p className="faint">No publications listed.</p>}
            {u.publications.map((p) => (
              <div className="pub" key={p.id}>
                <div><span className={`yr ${THIS_YEAR - p.year > 2 ? 'old' : ''}`}>{p.year}</span><span className="t">{p.title}</span></div>
                <div className="faint">
                  {p.venue}{p.venue && ', '}
                  {[...p.authors.map((a) => a.name), ...p.externalAuthors].join(', ')}
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <h3 style={{ marginBottom: 10 }}>Projects</h3>
            {u.projects.length === 0 && <p className="faint">Not on any projects yet.</p>}
            {u.projects.map((p) => (
              <div key={p.id} className="spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--rule-soft)' }}>
                <Link to={`/projects/${p.id}`}>{p.title}</Link>
                <Status value={p.status} />
              </div>
            ))}
          </section>
        </div>

        <aside>
          <section className="panel">
            <dl className="dl">
              <dt>Role</dt><dd>{u.role.toLowerCase()}</dd>
              {u.yearOfStudy && <><dt>Year</dt><dd>{u.yearOfStudy}</dd></>}
              <dt>Lab</dt><dd>{u.lab ? <>{u.lab.name}<div className="faint">Head: <UserLink user={u.lab.head} /></div></> : 'None yet'}</dd>
              {u.lab && u.role === 'FACULTY' && <><dt>Open slots</dt><dd>{u.lab.openSlots}</dd></>}
              {u.lookingFor.length > 0 && <><dt>Looking for</dt><dd>{u.lookingFor.map((x) => x.toLowerCase()).join(', ')}</dd></>}
              <dt>Last active</dt><dd>{u.lastActiveAt ? timeAgo(u.lastActiveAt) : '–'}</dd>
            </dl>
          </section>
          <section className="panel">
            <h3 style={{ marginBottom: 10 }}>Connections <span className="faint">({u.connectionCount})</span></h3>
            {u.connections.map((c) => (
              <div key={c.id} className="spread" style={{ padding: '5px 0' }}>
                <UserLink user={c} /><span className="faint">{c.department?.code}</span>
              </div>
            ))}
            {u.connections.length === 0 && <p className="faint">No connections yet.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}

/* ----------------------------- edit profile ----------------------------- */
const LOOKING = ['MENTOR', 'LAB', 'COLLABORATOR', 'PROJECT'];

export function ProfileEdit() {
  const { data, loading } = useQuery(MY_PROFILE_EDIT, { fetchPolicy: 'network-only' });
  if (loading || !data) return <Loading />;
  return <ProfileForm me={data.me} departments={data.departments} />;
}

function ProfileForm({ me, departments }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    name: me.name, bio: me.bio ?? '', title: me.title ?? '', program: me.program ?? '', yearOfStudy: me.yearOfStudy ?? '',
    interests: me.interests.join(', '), departmentId: me.department?.id ?? '', lookingFor: me.lookingFor,
  });
  const [skills, setSkills] = useState(me.skills.map(({ name, level }) => ({ name, level })));
  const [newSkill, setNewSkill] = useState('');
  const [save, { loading, error }] = useMutation(UPDATE_PROFILE);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isStudent = me.role === 'STUDENT';

  const addSkill = () => {
    const name = newSkill.trim().toLowerCase();
    if (name && !skills.some((s) => s.name === name)) setSkills([...skills, { name, level: 3 }]);
    setNewSkill('');
  };

  return (
    <>
      <div className="page-head"><h1>Edit profile</h1></div>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault();
        const input = {
          name: form.name, bio: form.bio, interests: csv(form.interests), skills,
          departmentId: form.departmentId || null,
          ...(isStudent ? { program: form.program, yearOfStudy: form.yearOfStudy ? Number(form.yearOfStudy) : null, lookingFor: form.lookingFor } : { title: form.title }),
        };
        try { await save({ variables: { input } }); toast({ kind: 'ok', title: 'Profile saved', body: 'Your matches will reflect the changes.' }); navigate(`/people/${me.id}`); }
        catch (err) { toast({ kind: 'error', title: 'Not saved', body: errorText(err) }); }
      }}>
        <section className="panel stack">
          <div className="form-grid">
            <label className="field">Name<input required value={form.name} onChange={set('name')} /></label>
            <label className="field">Department
              <select value={form.departmentId} onChange={set('departmentId')}>
                <option value="">Choose…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            {isStudent ? (
              <>
                <label className="field">Program<input value={form.program} onChange={set('program')} /></label>
                <label className="field">Year of study<input type="number" min={1} max={8} value={form.yearOfStudy} onChange={set('yearOfStudy')} /></label>
              </>
            ) : <label className="field">Title<input value={form.title} onChange={set('title')} /></label>}
          </div>
          <label className="field">Bio<textarea value={form.bio} onChange={set('bio')} /></label>
          <label className="field">Research interests (comma-separated)<input value={form.interests} placeholder="nlp, legal ai, retrieval" onChange={set('interests')} /></label>
          {isStudent && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field" style={{ marginBottom: 8, fontWeight: 600, color: 'var(--slate)', fontSize: '0.86rem' }}>I'm looking for</legend>
              <div className="row">
                {LOOKING.map((l) => (
                  <label key={l} className="check">
                    <input type="checkbox" checked={form.lookingFor.includes(l)} onChange={(e) => setForm({ ...form, lookingFor: e.target.checked ? [...form.lookingFor, l] : form.lookingFor.filter((x) => x !== l) })} />
                    {l.charAt(0) + l.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </section>

        <section className="panel">
          <h3 style={{ marginBottom: 6 }}>Skills</h3>
          <p className="faint" style={{ marginBottom: 12 }}>Level 1 is beginner, 5 is expert. Higher levels count more in matching.</p>
          {skills.map((s, i) => (
            <div key={s.name} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--rule-soft)' }}>
              <span>{s.name}</span>
              <span className="row">
                <input type="range" min={1} max={5} value={s.level} aria-label={`${s.name} level`} style={{ width: 140, border: 0, padding: 0, accentColor: 'var(--moss)' }}
                  onChange={(e) => setSkills(skills.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))} />
                <span className="faint" style={{ width: 24 }}>{s.level}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSkills(skills.filter((_, j) => j !== i))}>Remove</button>
              </span>
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <input style={{ maxWidth: 240 }} placeholder="Add a skill" aria-label="New skill" value={newSkill} onChange={(e) => setNewSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} />
            <button type="button" className="btn btn-sm" onClick={addSkill}>Add skill</button>
          </div>
        </section>
        <ErrorNote error={error} />
        <div className="row"><button className="btn btn-primary" disabled={loading}>Save profile</button><Link className="btn btn-ghost" to={`/people/${me.id}`}>Cancel</Link></div>
      </form>
    </>
  );
}
