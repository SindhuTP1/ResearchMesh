import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@apollo/client/react';
import { LOGIN, REGISTER, DEPARTMENTS } from '../graphql/operations.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ErrorNote } from '../components/ui.jsx';
import { Logo } from '../components/Layout.jsx';
import { Typewriter } from '../components/Hero.jsx';
import { ThemeToggle } from '../components/theme.jsx';

const FIELDS = ['NLP', 'cloud computing', 'DevOps', 'Spring Boot', 'green chemistry', 'robotics', 'genomics', 'industrial automation', 'cybersecurity', 'quantum computing'];

export const ROLES = [
  { value: 'STUDENT', slug: 'student', label: 'Student', blurb: 'Find mentors, labs and projects that fit your skills.' },
  { value: 'FACULTY', slug: 'faculty', label: 'Faculty', blurb: 'Run your lab, review join requests and find students.' },
  { value: 'ADMIN', slug: 'admin', label: 'Admin', blurb: 'Verify faculty, manage people and departments.' },
];
export const HOME_FOR_ROLE = { STUDENT: '/student', FACULTY: '/faculty', ADMIN: '/admin' };

const TITLES = ['Assistant Professor', 'Associate Professor', 'Professor', 'Professor & Head', 'Adjunct Professor', 'Visiting Faculty'];
const PROGRAMS = ['B.Tech', 'M.Tech', 'MCA', 'M.Sc Chemistry', 'M.Sc Biotech', 'M.Sc Physics', 'M.Sc Mathematics', 'PhD'];

/**
 * Decorative network: nodes = people, edges = shared interests. Nodes bob gently and the whole mesh
 * leans toward the mouse; a pulse travels along the edges.
 */
function MeshArt() {
  const nodes = [[60, 80], [180, 40], [300, 110], [120, 200], [250, 230], [370, 220], [200, 320], [330, 350], [80, 330]];
  const edges = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [2, 5], [4, 6], [5, 7], [6, 7], [3, 8], [8, 6], [1, 4]];
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return undefined;
    const move = (e) => {
      const r = parent.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--mx', `${x * 24}px`);
      el.style.setProperty('--my', `${y * 24}px`);
    };
    parent.addEventListener('pointermove', move);
    return () => parent.removeEventListener('pointermove', move);
  }, []);
  return (
    <svg ref={ref} className="mesh" viewBox="0 0 420 420" aria-hidden="true">
      {edges.map(([a, b], k) => (
        <line key={`${a}-${b}`} className="edge" style={{ animationDelay: `${k * 0.35}s` }} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} />
      ))}
      {nodes.map(([x, y], i) => (
        <circle key={i} className="node" style={{ animationDelay: `${i * 0.4}s` }} cx={x} cy={y} r={i === 4 ? 11 : 7}
          fill={i === 4 ? 'var(--amber)' : i % 3 === 0 ? 'var(--moss)' : 'var(--paper)'} stroke="var(--moss)" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function Intro() {
  return (
    <section className="auth-intro">
      <div className="spread">
        <div className="wordmark" style={{ padding: 0 }}><Logo /> ResearchMesh</div>
        <ThemeToggle />
      </div>
      <div>
        <h1>Find who is doing the research you care about, this year.</h1>
        <p className="hero-line">Mentors, labs and teammates in <Typewriter words={FIELDS} /></p>
        <p>
          Students find faculty by what they have published recently and whether their lab has room. Faculty find
          students across departments with the exact skills a project needs. Admins keep the directory trustworthy.
        </p>
      </div>
      <MeshArt />
    </section>
  );
}

/** The portal choice. Login checks the account really has this role. */
function RolePicker({ role, onChange, roles = ROLES, label }) {
  return (
    <fieldset className="role-picker">
      <legend>{label}</legend>
      <div className="role-options" role="radiogroup">
        {roles.map((r) => (
          <label key={r.value} className={`role-option ${role === r.value ? 'on' : ''}`}>
            <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => onChange(r.value)} />
            <b>{r.label}</b>
            <span>{r.blurb}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const roleFromParam = (p) => ROLES.find((r) => r.slug === p)?.value ?? 'STUDENT';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = roleFromParam(params.get('as'));
  const setRole = (r) => setParams({ as: ROLES.find((x) => x.value === r).slug }, { replace: true });
  const [form, setForm] = useState({ email: '', password: '' });
  const [run, { loading, error, reset }] = useMutation(LOGIN);
  const label = ROLES.find((r) => r.value === role).label.toLowerCase();

  const submit = async (e) => {
    e.preventDefault();
    const { data } = await run({ variables: { ...form, role } }).catch(() => ({}));
    if (data?.login) {
      login(data.login.token);
      navigate(HOME_FOR_ROLE[data.login.user.role], { replace: true });
    }
  };

  return (
    <div className="auth">
      <Intro />
      <section className="auth-form">
        <h2>Log in</h2>
        <form className="stack" style={{ marginTop: 18 }} onSubmit={submit}>
          <RolePicker label="I'm logging in as" role={role} onChange={(r) => { setRole(r); reset(); }} />
          <label className="field">{role === 'STUDENT' ? 'University email' : 'Email'}
            <input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field">Password
            <input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Logging in…' : `Log in as ${label}`}</button>
        </form>
        <p className="muted" style={{ marginTop: 14 }}>
          New here? <Link to={`/register?as=${ROLES.find((r) => r.value === role).slug}`}>Create a {label} account</Link>
        </p>
      </section>
    </div>
  );
}

export function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = roleFromParam(params.get('as'));
  const setRole = (r) => setParams({ as: ROLES.find((x) => x.value === r).slug }, { replace: true });
  const { data: deptData } = useQuery(DEPARTMENTS);
  const [form, setForm] = useState({ name: '', email: '', password: '', departmentId: '', program: '', yearOfStudy: '', title: '', adminCode: '' });
  const [run, { loading, error, reset }] = useMutation(REGISTER);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const input = { name: form.name, email: form.email, password: form.password, role, departmentId: form.departmentId || null };
    if (role === 'STUDENT') Object.assign(input, { program: form.program || null, yearOfStudy: form.yearOfStudy ? Number(form.yearOfStudy) : null });
    if (role === 'FACULTY') input.title = form.title || null;
    if (role === 'ADMIN') input.adminCode = form.adminCode;
    const { data } = await run({ variables: { input } }).catch(() => ({}));
    if (data?.register) {
      login(data.register.token);
      // Students go straight to adding skills and interests: matching is useless without them.
      navigate(role === 'STUDENT' ? '/profile/edit?welcome=1' : HOME_FOR_ROLE[role], { replace: true });
    }
  };

  return (
    <div className="auth">
      <Intro />
      <section className="auth-form">
        <h2>Create your account</h2>
        <form className="stack" style={{ marginTop: 18 }} onSubmit={submit}>
          <RolePicker label="I'm joining as" role={role} onChange={(r) => { setRole(r); reset(); }} />
          <label className="field">Full name<input required autoComplete="name" value={form.name} onChange={set('name')} placeholder={role === 'FACULTY' ? 'Dr. Firstname Lastname' : ''} /></label>
          <label className="field">{role === 'ADMIN' ? 'Work email' : 'University email'}<input type="email" autoComplete="email" required value={form.email} onChange={set('email')} /></label>
          <label className="field">Password (8+ characters)<input type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={set('password')} /></label>

          {role !== 'ADMIN' && (
            <label className="field">Department
              <select required={role === 'FACULTY'} value={form.departmentId} onChange={set('departmentId')}>
                <option value="">Choose…</option>
                {deptData?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}

          {role === 'STUDENT' && (
            <div className="form-grid">
              <label className="field">Program
                <select value={form.program} onChange={set('program')}>
                  <option value="">Choose…</option>
                  {PROGRAMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <label className="field">Year of study
                <select value={form.yearOfStudy} onChange={set('yearOfStudy')}>
                  <option value="">Choose…</option>
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </label>
            </div>
          )}

          {role === 'FACULTY' && (
            <>
              <label className="field">Designation
                <select required value={form.title} onChange={set('title')}>
                  <option value="">Choose…</option>
                  {TITLES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <p className="faint">An admin verifies new faculty accounts. You can set up your lab and post projects straight away; the verified badge appears once you're approved.</p>
            </>
          )}

          {role === 'ADMIN' && (
            <>
              <label className="field">Admin access code
                <input required autoComplete="off" value={form.adminCode} onChange={set('adminCode')} placeholder="RM-XXXXXX-XXXXXX" />
              </label>
              <p className="faint">Admin accounts need the access code configured on the server (<code>ADMIN_SIGNUP_CODE</code>). If it isn't set, the server prints a one-time code in its console when it starts.</p>
            </>
          )}

          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Creating…' : 'Create account'}</button>
        </form>
        <p className="muted" style={{ marginTop: 14 }}>Already registered? <Link to={`/login?as=${ROLES.find((r) => r.value === role).slug}`}>Log in</Link></p>
      </section>
    </div>
  );
}
