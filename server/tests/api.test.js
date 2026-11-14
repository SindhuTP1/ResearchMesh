/**
 * End-to-end API tests against an in-memory MongoDB and the real Express/Apollo/graphql-ws stack.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import WebSocket from 'ws';
import { createClient } from 'graphql-ws';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer } from '../src/app.js';
import { seed } from '../src/seed/seed.js';
import { signToken } from '../src/auth.js';
import { User } from '../src/models/index.js';

let mongod;
let server;
let url;
const tokens = {};
const STUDENT = { name: 'Siri Nadig', email: 'siri.nadig@univ.edu', password: 'correct-horse-9' };
const ADMIN_CODE = 'TEST-ADMIN-CODE';

async function gql(query, variables = {}, { token, headers = {} } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const LOGIN = `mutation($e:String!,$p:String!,$r:Role){ login(email:$e,password:$p,role:$r){ token user { id role } } }`;
const REGISTER = `mutation($i:RegisterInput!){ register(input:$i){ token user { id role verification isVerified } } }`;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('rm-test'));
  await seed();
  process.env.ADMIN_SIGNUP_CODE = ADMIN_CODE;
  server = await createServer({ port: 0 });
  url = `http://localhost:${server.port}/graphql`;

  // No demo accounts exist: register a real student and admin through the API.
  const st = await gql(REGISTER, { i: { ...STUDENT, role: 'STUDENT', program: 'MCA', yearOfStudy: 1 } });
  assert.ok(st.data?.register?.token, JSON.stringify(st.errors));
  tokens.student = st.data.register.token;
  const prof = await gql(
    `mutation($i:UpdateProfileInput!){ updateProfile(input:$i){ id } }`,
    { i: { interests: ['nlp', 'large language models', 'legal ai'], skills: [{ name: 'python', level: 4 }, { name: 'javascript', level: 4 }, { name: 'react', level: 4 }, { name: 'nlp', level: 3 }, { name: 'graphql', level: 3 }] } },
    { token: tokens.student }
  );
  assert.equal(prof.errors, undefined, JSON.stringify(prof.errors));

  const ad = await gql(REGISTER, { i: { name: 'Registrar Office', email: 'registrar@univ.edu', password: 'admin-pass-123', role: 'ADMIN', adminCode: ADMIN_CODE } });
  assert.ok(ad.data?.register?.token, JSON.stringify(ad.errors));
  tokens.admin = ad.data.register.token;

  // Seeded directory faculty have unknown passwords; tests mint a token for one directly.
  tokens.faculty = signToken(await User.findOne({ name: 'Dr. Ananya Rao' }));
});

after(async () => {
  await server?.stop();
  await mongoose.disconnect();
  await mongod?.stop();
});

test('headline query: NLP faculty, published in last 2 years, open slot', async () => {
  const r = await gql(
    `query { searchFaculty(input:{ area:"nlp", publishedWithinYears:2, hasOpenSlots:true }) {
        totalCount items { name lab { name openSlots } recentPublicationCount } } }`,
    {},
    { token: tokens.student }
  );
  assert.equal(r.errors, undefined, JSON.stringify(r.errors));
  const names = r.data.searchFaculty.items.map((f) => f.name);
  assert.ok(names.includes('Dr. Ananya Rao'), 'active NLP faculty with open slots should match');
  assert.ok(!names.includes('Dr. Vikram Menon'), 'NLP faculty whose last paper is 5+ years old is excluded');
  assert.ok(!names.includes('Dr. Kavitha Shetty'), 'NLP faculty with a full lab is excluded');
  for (const f of r.data.searchFaculty.items) {
    assert.ok(f.lab.openSlots > 0);
    assert.ok(f.recentPublicationCount > 0);
  }
});

test('faculty can search unattached python+genomics students; students cannot', async () => {
  const q = `query { searchStudents(input:{ skills:["python","genomics"], unattached:true }) {
      totalCount items { name lab { id } skills { name } } } }`;
  const asFaculty = await gql(q, {}, { token: tokens.faculty });
  assert.equal(asFaculty.errors, undefined, JSON.stringify(asFaculty.errors));
  assert.ok(asFaculty.data.searchStudents.totalCount > 0);
  for (const s of asFaculty.data.searchStudents.items) {
    assert.equal(s.lab, null);
    const names = s.skills.map((k) => k.name);
    assert.ok(names.includes('python') && names.includes('genomics'));
  }
  const asStudent = await gql(q, {}, { token: tokens.student });
  assert.equal(asStudent.errors[0].extensions.code, 'FORBIDDEN');
});

test('@auth field-level: student sees own email but not other users\' emails', async () => {
  const me = await gql(`{ me { email } }`, {}, { token: tokens.student });
  assert.equal(me.data.me.email, STUDENT.email);

  const other = await gql(
    `{ searchFaculty(input:{ area:"genomics" }) { items { name email } } }`,
    {},
    { token: tokens.student }
  );
  assert.ok(other.errors?.some((e) => e.extensions.code === 'FORBIDDEN'));

  const asFaculty = await gql(`{ searchFaculty(input:{ area:"genomics" }) { items { email } } }`, {}, { token: tokens.faculty });
  assert.equal(asFaculty.errors, undefined);
});

test('DataLoader collapses N+1: same nested query, far fewer DB round-trips', async () => {
  const q = `{ searchFaculty(input:{ limit: 20 }) { items {
      name department { name } lab { name members { name department { code } } }
      publications { title authors { name } } projects { title } } } }`;
  const on = await gql(q, {}, { token: tokens.faculty });
  const off = await gql(q, {}, { token: tokens.faculty, headers: { 'x-dataloader': 'off' } });
  assert.equal(on.errors, undefined, JSON.stringify(on.errors));
  assert.deepEqual(on.data, off.data, 'results must be identical');
  const a = on.extensions.dbQueries;
  const b = off.extensions.dbQueries;
  console.log(`      DataLoader ON: ${a} queries | OFF: ${b} queries`);
  assert.ok(a < 15, `batched should be ~1 query per type, got ${a}`);
  assert.ok(b > a * 3, `unbatched should be much larger (on=${a}, off=${b})`);
});

test('recommendedMentors returns ranked, explained matches', async () => {
  const r = await gql(
    `{ recommendedMentors(limit:5) { score reasons breakdown { skill interest recency availability } faculty { name } } }`,
    {},
    { token: tokens.student }
  );
  assert.equal(r.errors, undefined, JSON.stringify(r.errors));
  const list = r.data.recommendedMentors;
  assert.equal(list.length, 5);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
  // the student is into NLP / LLMs / legal AI → top match should be an NLP person
  assert.match(list[0].faculty.name, /Ananya|Kavitha|Deepak/);
});

test('subscriptions: faculty receives a live notification when a student requests to join', async () => {
  // Find an NLP project owned by the faculty member
  const p = await gql(`{ projects(openOnly:true, tag:"nlp") { id title owner { id } } }`, {}, { token: tokens.student });
  const facultyMe = await gql(`{ me { id } }`, {}, { token: tokens.faculty });
  const project = p.data.projects.find((x) => x.owner.id === facultyMe.data.me.id);
  assert.ok(project, 'expected an open NLP project owned by faculty');

  const client = createClient({
    url: url.replace('http', 'ws'),
    webSocketImpl: WebSocket,
    connectionParams: { authorization: `Bearer ${tokens.faculty}` },
  });

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no notification within 5s')), 5000);
    const unsubscribe = client.subscribe(
      { query: `subscription { notificationAdded { type message actor { name } project { title } } }` },
      {
        next: (msg) => { clearTimeout(timer); unsubscribe(); resolve(msg); },
        error: reject,
        complete: () => {},
      }
    );
  });
  await new Promise((r) => setTimeout(r, 300)); // let the subscription register

  const req = await gql(
    `mutation($id:ID!){ requestToJoin(targetType:PROJECT, targetId:$id, message:"Keen on this!") { id status } }`,
    { id: project.id },
    { token: tokens.student }
  );
  assert.equal(req.errors, undefined, JSON.stringify(req.errors));

  const msg = await received;
  assert.equal(msg.data.notificationAdded.type, 'JOIN_REQUEST');
  assert.equal(msg.data.notificationAdded.actor.name, STUDENT.name);
  assert.equal(msg.data.notificationAdded.project.title, project.title);

  // duplicate request blocked
  const dup = await gql(`mutation($id:ID!){ requestToJoin(targetType:PROJECT, targetId:$id) { id } }`, { id: project.id }, { token: tokens.student });
  assert.match(dup.errors[0].message, /pending/);

  // faculty accepts → student becomes a member
  const accepted = await gql(
    `mutation($id:ID!){ respondToJoinRequest(id:$id, accept:true) { status project { members { name } } } }`,
    { id: req.data.requestToJoin.id },
    { token: tokens.faculty }
  );
  assert.equal(accepted.data.respondToJoinRequest.status, 'ACCEPTED');
  assert.ok(accepted.data.respondToJoinRequest.project.members.some((m) => m.name === STUDENT.name));
  await client.dispose();
});

test('admin-only query is rejected for non-admins and works for admins', async () => {
  const q = `{ adminStats { users students faculty unattachedStudents } }`;
  const asFaculty = await gql(q, {}, { token: tokens.faculty });
  assert.equal(asFaculty.errors[0].extensions.code, 'FORBIDDEN');
  const asAdmin = await gql(q, {}, { token: tokens.admin });
  assert.ok(asAdmin.data.adminStats.users > 100);
});

test('lab grants are hidden from students', async () => {
  const q = `{ labs(area:"genomics") { name grants { amount } } }`;
  const asStudent = await gql(q, {}, { token: tokens.student });
  assert.ok(asStudent.errors?.some((e) => e.extensions.code === 'FORBIDDEN'));
  const asFaculty = await gql(q, {}, { token: tokens.faculty });
  assert.equal(asFaculty.errors, undefined);
});

test('register + login validation', async () => {
  const bad = await gql(`mutation { register(input:{name:"X", email:"x@y.z", password:"short", role:STUDENT}) { token } }`);
  assert.match(bad.errors[0].message, /8 characters/);
  const admin = await gql(`mutation { register(input:{name:"X", email:"x@y.z", password:"longenough1", role:ADMIN}) { token } }`);
  assert.equal(admin.errors[0].extensions.code, 'FORBIDDEN', 'admin sign-up without the access code is refused');
  const badCode = await gql(`mutation { register(input:{name:"X", email:"x@y.z", password:"longenough1", role:ADMIN, adminCode:"guess"}) { token } }`);
  assert.equal(badCode.errors[0].extensions.code, 'FORBIDDEN');
  const ok = await gql(`mutation { register(input:{name:"New Student", email:"new@uni.edu", password:"longenough1", role:STUDENT}) { token user { name role } } }`);
  assert.equal(ok.data.register.user.role, 'STUDENT');
  const wrong = await gql(LOGIN, { e: 'new@uni.edu', p: 'nope' });
  assert.match(wrong.errors[0].message, /Invalid/);
});

test('login is tied to the portal the user picked', async () => {
  const ok = await gql(LOGIN, { e: STUDENT.email, p: STUDENT.password, r: 'STUDENT' });
  assert.equal(ok.data.login.user.role, 'STUDENT');
  const wrong = await gql(LOGIN, { e: STUDENT.email, p: STUDENT.password, r: 'FACULTY' });
  assert.equal(wrong.errors[0].extensions.code, 'FORBIDDEN');
  assert.match(wrong.errors[0].message, /registered as student/);
});

test('seeded directory profiles cannot be logged into', async () => {
  for (const p of ['password123', 'password', 'admin']) {
    const r = await gql(LOGIN, { e: 'ananya.rao@univ.edu', p });
    assert.match(r.errors[0].message, /Invalid/);
  }
});

test('new faculty wait for admin verification; admin approves', async () => {
  const depts = await gql(`{ departments { id code } }`);
  const chem = depts.data.departments.find((d) => d.code === 'CHEM');
  const noDept = await gql(REGISTER, { i: { name: 'Dr. No Dept', email: 'nodept@univ.edu', password: 'longenough1', role: 'FACULTY' } });
  assert.match(noDept.errors[0].message, /department/);

  const r = await gql(REGISTER, { i: { name: 'Dr. New Chemist', email: 'chemist@univ.edu', password: 'longenough1', role: 'FACULTY', departmentId: chem.id, title: 'Assistant Professor' } });
  assert.equal(r.data.register.user.verification, 'PENDING');
  assert.equal(r.data.register.user.isVerified, false);

  const queue = await gql(`{ pendingVerifications { id name } adminStats { pendingVerifications } }`, {}, { token: tokens.admin });
  assert.ok(queue.data.pendingVerifications.some((u) => u.name === 'Dr. New Chemist'));
  assert.ok(queue.data.adminStats.pendingVerifications >= 3, 'two seeded + one new');

  const asFaculty = await gql(`mutation($id:ID!){ verifyFaculty(userId:$id, approve:true){ id } }`, { id: r.data.register.user.id }, { token: tokens.faculty });
  assert.equal(asFaculty.errors[0].extensions.code, 'FORBIDDEN');
  const v = await gql(`mutation($id:ID!){ verifyFaculty(userId:$id, approve:true){ verification isVerified } }`, { id: r.data.register.user.id }, { token: tokens.admin });
  assert.deepEqual(v.data.verifyFaculty, { verification: 'VERIFIED', isVerified: true });
});

test('faculty search: new fields, multi-area, designation and sort filters', async () => {
  const q = `query($i:FacultySearchInput!){ searchFaculty(input:$i){ totalCount items { name title department { code } lab { openSlots } } } }`;
  const chem = await gql(q, { i: { areas: ['chemistry'], limit: 50 } }, { token: tokens.student });
  assert.ok(chem.data.searchFaculty.totalCount >= 5, 'several chemistry faculty');

  const cloudDevops = await gql(q, { i: { areas: ['cloud', 'devops'], limit: 50 } }, { token: tokens.student });
  const names = cloudDevops.data.searchFaculty.items.map((f) => f.name);
  assert.ok(names.includes('Dr. Suresh Babu') && names.includes('Dr. Nisha Agarwal'));

  const spring = await gql(q, { i: { skills: ['java', 'spring boot'], limit: 50 } }, { token: tokens.student });
  assert.ok(spring.data.searchFaculty.items.some((f) => f.name === 'Dr. Rajesh Khanna'));

  const profs = await gql(q, { i: { titles: ['Professor'], sortBy: 'NAME', limit: 50 } }, { token: tokens.student });
  const list = profs.data.searchFaculty.items;
  assert.ok(list.length > 3 && list.every((f) => f.title === 'Professor'));
  assert.deepEqual(list.map((f) => f.name), [...list.map((f) => f.name)].sort());

  const open = await gql(q, { i: { sortBy: 'OPEN_SLOTS', hasLab: true, limit: 5 } }, { token: tokens.student });
  const slots = open.data.searchFaculty.items.map((f) => f.lab.openSlots);
  assert.deepEqual(slots, [...slots].sort((a, b) => b - a));

  const busy = await gql(q, { i: { minRecentPublications: 3, limit: 50 } }, { token: tokens.student });
  assert.ok(busy.data.searchFaculty.items.some((f) => f.name === 'Dr. Rahul Iyer'));
  assert.ok(!busy.data.searchFaculty.items.some((f) => f.name === 'Dr. Vikram Menon'));
});

test('filter options come from the data', async () => {
  const r = await gql(`{ filterOptions(role:FACULTY){ areas { value count } skills { value } titles } }`, {}, { token: tokens.student });
  const areas = r.data.filterOptions.areas.map((a) => a.value);
  for (const a of ['devops', 'cloud computing', 'spring boot', 'industrial automation', 'green chemistry']) assert.ok(areas.includes(a), a);
  assert.ok(r.data.filterOptions.skills.some((x) => x.value === 'java'));
  assert.ok(r.data.filterOptions.titles.includes('Associate Professor'));
});

test('students get ranked project recommendations', async () => {
  const r = await gql(`{ recommendedProjects(limit:5){ score reasons project { title } } }`, {}, { token: tokens.student });
  assert.equal(r.errors, undefined, JSON.stringify(r.errors));
  const list = r.data.recommendedProjects;
  assert.ok(list.length > 0);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
});

test('global search: students and faculty search people, projects, labs and papers', async () => {
  const Q = `query($q:String!,$t:SearchType,$l:Int,$o:Int){ search(q:$q,type:$t,limit:$l,offset:$o){
    query facultyCount studentCount projectCount labCount publicationCount
    faculty { id name role } students { id name role } projects { title } labs { name } publications { title year } } }`;

  // Needs a login.
  const anon = await gql(Q, { q: 'nlp' });
  assert.ok(anon.errors?.length, 'anonymous search should be rejected');

  // Students: a topic finds faculty and other kinds of results.
  const st = await gql(Q, { q: 'nlp' }, { token: tokens.student });
  assert.equal(st.errors, undefined, JSON.stringify(st.errors));
  const s = st.data.search;
  assert.ok(s.facultyCount > 0, 'nlp should match some faculty');
  assert.ok(s.faculty.length <= 5);
  for (const f of s.faculty) assert.equal(f.role, 'FACULTY');
  // The caller is never in their own results, and students still can't read emails through search.
  assert.ok(!s.students.some((u) => u.name === STUDENT.name));
  const emails = await gql(`{ search(q:"nlp"){ faculty { email } } }`, {}, { token: tokens.student });
  assert.ok(emails.errors?.some((e) => /FACULTY/.test(e.message)));

  // A name hit ranks first.
  const rao = await gql(Q, { q: 'ananya rao' }, { token: tokens.student });
  assert.equal(rao.data.search.faculty[0]?.name, 'Dr. Ananya Rao');

  // Faculty find the registered student by a skill + interest; every word must match.
  const fa = await gql(Q, { q: 'legal ai' }, { token: tokens.faculty });
  assert.ok(fa.data.search.students.some((u) => u.name === STUDENT.name), JSON.stringify(fa.data.search.students));
  const none = await gql(Q, { q: 'legal zzzunknownzzz' }, { token: tokens.faculty });
  assert.equal(none.data.search.studentCount, 0);

  // type + offset pages one list; the other lists are empty but counts are still there.
  const page = await gql(Q, { q: 'nlp', t: 'FACULTY', l: 1, o: 1 }, { token: tokens.student });
  assert.equal(page.data.search.projects.length, 0);
  assert.equal(page.data.search.projectCount, s.projectCount);
  if (s.facultyCount > 1) assert.notEqual(page.data.search.faculty[0].id, s.faculty[0].id);

  // Too short, or regex characters: no crash, no results.
  const short = await gql(Q, { q: 'a' }, { token: tokens.student });
  assert.equal(short.data.search.facultyCount, 0);
  const weird = await gql(Q, { q: '.*(' }, { token: tokens.student });
  assert.equal(weird.errors, undefined, JSON.stringify(weird.errors));
});
