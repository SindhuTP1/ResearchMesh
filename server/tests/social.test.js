/**
 * Teammates, connections, chat and call signalling — end to end over HTTP and graphql-ws.
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
const t = {}; // tokens
const id = {}; // user ids

async function gql(query, variables = {}, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}
const ok = (r) => {
  assert.equal(r.errors, undefined, JSON.stringify(r.errors));
  return r.data;
};

async function register(key, input, profile) {
  const r = ok(await gql(`mutation($i:RegisterInput!){ register(input:$i){ token user { id } } }`, { i: { password: 'longenough1', ...input } }));
  t[key] = r.register.token;
  id[key] = r.register.user.id;
  if (profile) ok(await gql(`mutation($i:UpdateProfileInput!){ updateProfile(input:$i){ id } }`, { i: profile }, t[key]));
}

/** Subscribe and collect the first `n` events (or reject after a timeout). */
function listen(token, query, n = 1, ms = 5000) {
  const client = createClient({ url: url.replace('http', 'ws'), webSocketImpl: WebSocket, connectionParams: { authorization: `Bearer ${token}` } });
  const got = [];
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`expected ${n} event(s), got ${got.length}`)), ms);
    client.subscribe({ query }, {
      next: (msg) => { got.push(msg.data); if (got.length >= n) { clearTimeout(timer); resolve(got); } },
      error: reject,
      complete: () => {},
    });
  });
  return { done: done.finally(() => client.dispose()), ready: new Promise((r) => setTimeout(r, 300)) };
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('rm-social'));
  await seed();
  server = await createServer({ port: 0 });
  url = `http://localhost:${server.port}/graphql`;
  const devops = { interests: ['devops', 'cloud computing'], skills: [{ name: 'java', level: 4 }, { name: 'spring boot', level: 3 }], lookingFor: ['COLLABORATOR'] };
  await register('asha', { name: 'Asha Kulkarni', email: 'asha@univ.edu', role: 'STUDENT' }, devops);
  await register('ben', { name: 'Ben Dsouza', email: 'ben@univ.edu', role: 'STUDENT' }, { ...devops, skills: [{ name: 'kubernetes', level: 4 }, { name: 'terraform', level: 3 }] });
  await register('chen', { name: 'Chen Rao', email: 'chen@univ.edu', role: 'STUDENT' }, { interests: ['green chemistry'], skills: [{ name: 'hplc', level: 3 }] });
  const fac = await User.findOne({ name: 'Dr. Nisha Agarwal' });
  t.prof = signToken(fac);
  id.prof = String(fac._id);
});

after(async () => {
  await server?.stop();
  await mongoose.disconnect();
  await mongod?.stop();
});

test('find teammates: same domain ranks first, unrelated student ranks low', async () => {
  const r = ok(await gql(`{ findTeammates(input:{ limit: 100 }) { totalCount items { score reasons newSkills student { id name } } } }`, {}, t.asha));
  const items = r.findTeammates.items;
  const pos = (sid) => items.findIndex((m) => m.student.id === sid);
  assert.ok(pos(id.ben) >= 0 && pos(id.ben) < 5, 'Ben shares devops + cloud → near the top');
  assert.ok(pos(id.chen) > pos(id.ben), 'Chen (chemistry) ranks below Ben');
  assert.ok(items[pos(id.ben)].newSkills.includes('kubernetes'));
  assert.ok(!items.some((m) => m.student.id === id.asha), 'never yourself');

  const filtered = ok(await gql(`{ findTeammates(input:{ interests:["devops"], lookingForTeam:true }) { items { student { interests lookingFor } } } }`, {}, t.asha));
  for (const m of filtered.findTeammates.items) {
    assert.ok(m.student.interests.includes('devops'));
    assert.ok(m.student.lookingFor.some((x) => ['COLLABORATOR', 'PROJECT'].includes(x)));
  }
});

test('chat needs a connection: request → accept → message', async () => {
  const blocked = await gql(`mutation($u:ID!){ openDirectConversation(userId:$u){ id } }`, { u: id.ben }, t.asha);
  assert.equal(blocked.errors[0].extensions.code, 'FORBIDDEN', 'strangers cannot DM');

  const sent = ok(await gql(`mutation($u:ID!){ sendConnectionRequest(userId:$u, message:"Team up for the devops hackathon?"){ connectionStatus } }`, { u: id.ben }, t.asha));
  assert.equal(sent.sendConnectionRequest.connectionStatus, 'OUTGOING');
  const dup = await gql(`mutation($u:ID!){ sendConnectionRequest(userId:$u){ id } }`, { u: id.ben }, t.asha);
  assert.match(dup.errors[0].message, /already sent/);

  const incoming = ok(await gql(`{ connectionRequests(direction:INCOMING){ id message from { name } } }`, {}, t.ben));
  assert.equal(incoming.connectionRequests[0].from.name, 'Asha Kulkarni');
  const view = ok(await gql(`query($u:ID!){ user(id:$u){ connectionStatus pendingConnectionRequestId } }`, { u: id.asha }, t.ben));
  assert.equal(view.user.connectionStatus, 'INCOMING');

  ok(await gql(`mutation($i:ID!){ respondToConnectionRequest(id:$i, accept:true){ status } }`, { i: incoming.connectionRequests[0].id }, t.ben));
  const after = ok(await gql(`query($u:ID!){ user(id:$u){ connectionStatus } }`, { u: id.ben }, t.asha));
  assert.equal(after.user.connectionStatus, 'CONNECTED');

  const conv = ok(await gql(`mutation($u:ID!){ openDirectConversation(userId:$u){ id type title } }`, { u: id.ben }, t.asha)).openDirectConversation;
  assert.equal(conv.type, 'DIRECT');
  assert.equal(conv.title, 'Ben Dsouza');
  const again = ok(await gql(`mutation($u:ID!){ openDirectConversation(userId:$u){ id } }`, { u: id.asha }, t.ben)).openDirectConversation;
  assert.equal(again.id, conv.id, 'one conversation per pair');

  // Ben is listening live; Asha sends.
  const sub = listen(t.ben, `subscription { messageAdded { body conversationId sender { name } } }`);
  await sub.ready;
  ok(await gql(`mutation($c:ID!){ sendMessage(conversationId:$c, body:"Hi Ben! Want to build a CI pipeline together?"){ id } }`, { c: conv.id }, t.asha));
  const [evt] = await sub.done;
  assert.equal(evt.messageAdded.sender.name, 'Asha Kulkarni');
  assert.equal(evt.messageAdded.conversationId, conv.id);

  const inbox = ok(await gql(`{ conversations { id unreadCount lastMessage { body } } unreadMessageCount }`, {}, t.ben));
  assert.equal(inbox.conversations.find((c) => c.id === conv.id).unreadCount, 1);
  assert.equal(inbox.unreadMessageCount, 1);
  ok(await gql(`mutation($c:ID!){ markConversationRead(conversationId:$c){ unreadCount } }`, { c: conv.id }, t.ben));
  assert.equal(ok(await gql(`{ unreadMessageCount }`, {}, t.ben)).unreadMessageCount, 0);

  const outsider = await gql(`query($c:ID!){ messages(conversationId:$c){ items { body } } }`, { c: conv.id }, t.chen);
  assert.equal(outsider.errors[0].extensions.code, 'FORBIDDEN', 'non-members cannot read');
});

test('accepting a join request connects student and faculty immediately', async () => {
  const p = ok(await gql(`{ projects(openOnly:true, limit:100){ id title owner { id } } }`, {}, t.chen)).projects.find((x) => x.owner.id === id.prof);
  const before = await gql(`mutation($u:ID!){ openDirectConversation(userId:$u){ id } }`, { u: id.prof }, t.chen);
  assert.equal(before.errors[0].extensions.code, 'FORBIDDEN');

  const jr = ok(await gql(`mutation($p:ID!){ requestToJoin(targetType:PROJECT, targetId:$p){ id } }`, { p: p.id }, t.chen)).requestToJoin;
  ok(await gql(`mutation($i:ID!){ respondToJoinRequest(id:$i, accept:true){ status } }`, { i: jr.id }, t.prof));

  const st = ok(await gql(`query($u:ID!){ user(id:$u){ connectionStatus } }`, { u: id.prof }, t.chen));
  assert.equal(st.user.connectionStatus, 'CONNECTED');
  ok(await gql(`mutation($u:ID!){ openDirectConversation(userId:$u){ id } }`, { u: id.prof }, t.chen));
});

test('faculty group chat for the lab; students can only add people they know', async () => {
  const lab = ok(await gql(`{ me { lab { id members { id } } } }`, {}, t.prof)).me.lab;
  const conv = ok(await gql(`mutation($l:ID!){ openLabConversation(labId:$l){ id type canManage members { id } } }`, { l: lab.id }, t.prof)).openLabConversation;
  assert.equal(conv.type, 'GROUP');
  assert.ok(conv.canManage);
  assert.equal(conv.members.length, lab.members.length + 1);

  // Faculty builds an ad-hoc group from a project teammate (Chen, accepted above).
  const g = ok(await gql(`mutation($i:GroupInput!){ createGroupConversation(input:$i){ id name members { name } } }`, { i: { name: 'Pipeline reading group', memberIds: [id.chen] } }, t.prof)).createGroupConversation;
  assert.deepEqual(g.members.map((m) => m.name).sort(), ['Chen Rao', 'Dr. Nisha Agarwal']);

  // A student's own group: Asha can add Ben (connected) but not Chen (stranger to her).
  const bad = await gql(`mutation($i:GroupInput!){ createGroupConversation(input:$i){ id } }`, { i: { name: 'Hackathon', memberIds: [id.ben, id.chen] } }, t.asha);
  assert.equal(bad.errors[0].extensions.code, 'FORBIDDEN');
  const team = ok(await gql(`mutation($i:GroupInput!){ createGroupConversation(input:$i){ id canManage } }`, { i: { name: 'Hackathon', memberIds: [id.ben] } }, t.asha)).createGroupConversation;
  assert.ok(team.canManage);
  const notAdmin = await gql(`mutation($c:ID!,$u:ID!){ removeConversationMember(conversationId:$c, userId:$u){ id } }`, { c: team.id, u: id.asha }, t.ben);
  assert.equal(notAdmin.errors[0].extensions.code, 'FORBIDDEN');
  ok(await gql(`mutation($c:ID!){ leaveConversation(conversationId:$c) }`, { c: team.id }, t.ben));
  const left = await gql(`query($c:ID!){ conversation(id:$c){ id } }`, { c: team.id }, t.ben);
  assert.equal(left.errors[0].extensions.code, 'FORBIDDEN');
});

test('student team: invite a teammate to a student project, accept joins the team chat', async () => {
  const p = ok(await gql(`mutation{ createProject(input:{ title:"Self-hosted CI for clubs", requiredSkills:["docker"], tags:["devops"], maxMembers:4 }){ id } }`, {}, t.asha)).createProject;
  const conv = ok(await gql(`mutation($p:ID!){ openProjectConversation(projectId:$p){ id members { id } } }`, { p: p.id }, t.asha)).openProjectConversation;
  assert.equal(conv.members.length, 1);

  const inv = ok(await gql(`mutation($p:ID!,$u:ID!){ inviteToProject(projectId:$p, userId:$u, message:"Join us?"){ id kind status } }`, { p: p.id, u: id.ben }, t.asha)).inviteToProject;
  assert.equal(inv.kind, 'INVITE');
  const notOwner = await gql(`mutation($p:ID!,$u:ID!){ inviteToProject(projectId:$p, userId:$u){ id } }`, { p: p.id, u: id.chen }, t.ben);
  assert.equal(notOwner.errors[0].extensions.code, 'FORBIDDEN');

  const mine = ok(await gql(`{ myJoinRequests(direction:INCOMING, status:PENDING){ id kind project { title } } }`, {}, t.ben)).myJoinRequests;
  assert.ok(mine.some((r) => r.id === inv.id && r.kind === 'INVITE'));
  ok(await gql(`mutation($i:ID!){ respondToJoinRequest(id:$i, accept:true){ status } }`, { i: inv.id }, t.ben));

  const after = ok(await gql(`query($c:ID!){ conversation(id:$c){ members { id } } project(id:"${p.id}"){ members { id } } }`, { c: conv.id }, t.asha));
  assert.ok(after.conversation.members.some((m) => m.id === id.ben), 'added to team chat');
  assert.ok(after.project.members.some((m) => m.id === id.ben), 'added to project');
});

test('video call signalling is relayed only to the addressed member', async () => {
  const conv = ok(await gql(`mutation($u:ID!){ openDirectConversation(userId:$u){ id } }`, { u: id.ben }, t.asha)).openDirectConversation;
  const ben = listen(t.ben, `subscription { callSignal { type callId from { name } to payload } }`, 2);
  const chen = listen(t.chen, `subscription { callSignal { type } }`, 1, 1500);
  await Promise.all([ben.ready, chen.ready]);

  ok(await gql(`mutation($i:CallSignalInput!){ sendCallSignal(input:$i) }`, { i: { conversationId: conv.id, callId: 'c1', type: 'RING' } }, t.asha));
  ok(await gql(`mutation($i:CallSignalInput!){ sendCallSignal(input:$i) }`, { i: { conversationId: conv.id, callId: 'c1', type: 'OFFER', to: id.ben, payload: '{"sdp":"x"}' } }, t.asha));
  const [ring, offer] = await ben.done;
  assert.equal(ring.callSignal.type, 'RING');
  assert.equal(ring.callSignal.from.name, 'Asha Kulkarni');
  assert.equal(offer.callSignal.payload, '{"sdp":"x"}');
  await assert.rejects(chen.done, /expected 1/, 'outsiders receive nothing');

  const outsider = await gql(`mutation($i:CallSignalInput!){ sendCallSignal(input:$i) }`, { i: { conversationId: conv.id, callId: 'c2', type: 'RING' } }, t.chen);
  assert.equal(outsider.errors[0].extensions.code, 'FORBIDDEN');
});

test('chat extras: attachments, edit, delete, reactions, typing, read receipts, presence, push key', async () => {
  const conv = ok(await gql(`mutation($u:ID!){ openDirectConversation(userId:$u){ id } }`, { u: id.ben }, t.asha)).openDirectConversation;
  const base = url.replace('/graphql', '');

  // --- presence: Ben opens a socket → Asha sees him online
  const benSocket = listen(t.ben, `subscription { typing { conversationId typing user { name } } }`, 1);
  await benSocket.ready;
  const online = ok(await gql(`query($u:ID!){ user(id:$u){ isOnline } }`, { u: id.ben }, t.asha));
  assert.equal(online.user.isOnline, true);

  // --- typing: Asha types, Ben's socket gets it
  ok(await gql(`mutation($c:ID!){ setTyping(conversationId:$c, typing:true) }`, { c: conv.id }, t.asha));
  const [typing] = await benSocket.done;
  assert.deepEqual(typing.typing, { conversationId: conv.id, typing: true, user: { name: 'Asha Kulkarni' } });

  // --- upload a file into the conversation (GridFS) and send it
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'diagram.png');
  const up = await fetch(`${base}/api/upload?conversationId=${conv.id}`, { method: 'POST', headers: { authorization: `Bearer ${t.asha}` }, body: form });
  assert.equal(up.status, 200);
  const file = await up.json();
  assert.equal(file.name, 'diagram.png');
  const outsiderUp = await fetch(`${base}/api/upload?conversationId=${conv.id}`, { method: 'POST', headers: { authorization: `Bearer ${t.chen}` }, body: form });
  assert.equal(outsiderUp.status, 403, 'non-members cannot upload into the chat');

  const sent = ok(await gql(`mutation($c:ID!,$f:ID!){ sendMessage(conversationId:$c, body:"Architecture sketch", attachmentId:$f){ id attachment { name isImage url size } } }`, { c: conv.id, f: file.fileId }, t.asha)).sendMessage;
  assert.equal(sent.attachment.isImage, true);
  const dl = await fetch(`${base}${sent.attachment.url}?token=${t.ben}`);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(`${base}${sent.attachment.url}?token=${t.chen}`)).status, 403, 'outsiders cannot download');
  const reuse = await gql(`mutation($c:ID!,$f:ID!){ sendMessage(conversationId:$c, attachmentId:$f){ id } }`, { c: conv.id, f: file.fileId }, t.ben);
  assert.ok(reuse.errors, "you can't send someone else's upload");

  // --- edit (only the sender), react, delete
  const notMine = await gql(`mutation($m:ID!){ editMessage(id:$m, body:"hacked"){ id } }`, { m: sent.id }, t.ben);
  assert.equal(notMine.errors[0].extensions.code, 'FORBIDDEN');
  const edited = ok(await gql(`mutation($m:ID!){ editMessage(id:$m, body:"Architecture sketch v2"){ body editedAt } }`, { m: sent.id }, t.asha)).editMessage;
  assert.equal(edited.body, 'Architecture sketch v2');
  assert.ok(edited.editedAt);

  const r1 = ok(await gql(`mutation($m:ID!){ toggleReaction(messageId:$m, emoji:"🎉"){ reactions { emoji count mine } } }`, { m: sent.id }, t.ben)).toggleReaction;
  assert.deepEqual(r1.reactions, [{ emoji: '🎉', count: 1, mine: true }]);
  const r2 = ok(await gql(`mutation($m:ID!){ toggleReaction(messageId:$m, emoji:"🎉"){ reactions { emoji } } }`, { m: sent.id }, t.ben)).toggleReaction;
  assert.deepEqual(r2.reactions, [], 'second tap removes it');
  const badEmoji = await gql(`mutation($m:ID!){ toggleReaction(messageId:$m, emoji:"💩"){ id } }`, { m: sent.id }, t.ben);
  assert.ok(badEmoji.errors);

  const del = ok(await gql(`mutation($m:ID!){ deleteMessage(id:$m){ isDeleted body attachment { id } } }`, { m: sent.id }, t.asha)).deleteMessage;
  assert.deepEqual(del, { isDeleted: true, body: '', attachment: null });
  assert.equal((await fetch(`${base}${sent.attachment.url}?token=${t.asha}`)).status, 404, 'file is removed with the message');

  // --- read receipts: Ben reads, Asha sees when
  ok(await gql(`mutation($c:ID!){ markConversationRead(conversationId:$c){ id } }`, { c: conv.id }, t.ben));
  const receipts = ok(await gql(`query($c:ID!){ conversation(id:$c){ readBy { user { name } at } } }`, { c: conv.id }, t.asha)).conversation.readBy;
  assert.ok(receipts.some((r) => r.user.name === 'Ben Dsouza'));

  // --- web push: server exposes a VAPID key and validates subscriptions
  const key = ok(await gql(`{ pushPublicKey }`, {}, t.asha)).pushPublicKey;
  assert.ok(key && key.length > 40);
  const bad = await gql(`mutation{ savePushSubscription(subscription:"{}") }`, {}, t.asha);
  assert.ok(bad.errors);
  const good = ok(await gql(`mutation($s:String!){ savePushSubscription(subscription:$s) }`, { s: JSON.stringify({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'x', auth: 'y' } }) }, t.asha));
  assert.equal(good.savePushSubscription, true);
});
