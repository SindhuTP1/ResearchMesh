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

let mongod;
let server;
let url;
const tokens = {};

async function gql(query, variables = {}, { token, headers = {} } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

const LOGIN = `mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token user { id role } } }`;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('rm-test'));
  await seed();
  server = await createServer({ port: 0 });
  url = `http://localhost:${server.port}/graphql`;
  for (const who of ['student', 'faculty', 'admin']) {
    const r = await gql(LOGIN, { e: `${who}@researchmesh.dev`, p: 'password123' });
    assert.ok(r.data?.login?.token, JSON.stringify(r.errors));
    tokens[who] = r.data.login.token;
  }
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
  assert.equal(me.data.me.email, 'student@researchmesh.dev');

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
  // demo student is into NLP / LLMs / legal AI → top match should be an NLP person
  assert.match(list[0].faculty.name, /Ananya|Kavitha|Deepak/);
});

test('subscriptions: faculty receives a live notification when a student requests to join', async () => {
  // Find an NLP project owned by the demo faculty
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
  assert.equal(msg.data.notificationAdded.actor.name, 'Siri Demo');
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
  assert.ok(accepted.data.respondToJoinRequest.project.members.some((m) => m.name === 'Siri Demo'));
  await client.dispose();
});

test('admin-only query is rejected for non-admins and works for admins', async () => {
  const q = `{ adminStats { users students faculty unattachedStudents } }`;
  const asFaculty = await gql(q, {}, { token: tokens.faculty });
  assert.equal(asFaculty.errors[0].extensions.code, 'FORBIDDEN');
  const asAdmin = await gql(q, {}, { token: tokens.admin });
  assert.ok(asAdmin.data.adminStats.users > 30);
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
  assert.equal(admin.errors[0].extensions.code, 'FORBIDDEN');
  const ok = await gql(`mutation { register(input:{name:"New Student", email:"new@uni.edu", password:"longenough1", role:STUDENT}) { token user { name role } } }`);
  assert.equal(ok.data.register.user.role, 'STUDENT');
  const wrong = await gql(LOGIN, { e: 'new@uni.edu', p: 'nope' });
  assert.match(wrong.errors[0].message, /Invalid/);
});
