import { User, Lab, Project, Conversation, Message } from '../models/index.js';
import { pubsub, EVENTS } from '../pubsub.js';
import { pushInBackground } from './push.js';

const str = (id) => String(id);
const same = (a, b) => str(a) === str(b);

/** Mutually connect two users (idempotent). Returns true if they weren't connected before. */
export async function connectUsers(a, b) {
  if (same(a, b)) return false;
  const before = await User.exists({ _id: a, connections: b });
  await Promise.all([
    User.updateOne({ _id: a }, { $addToSet: { connections: b } }),
    User.updateOne({ _id: b }, { $addToSet: { connections: a } }),
  ]);
  return !before;
}

/**
 * Everyone `user` is allowed to start a chat with or add to a group:
 *  - their connections
 *  - people they share a project with
 *  - people in the same lab (members + head)
 * Returns a Set of id strings (excluding the user).
 */
export async function reachableIds(user) {
  const me = await User.findById(user._id).select('connections lab').lean();
  const ids = new Set((me?.connections ?? []).map(str));
  const [projects, labs] = await Promise.all([
    Project.find({ members: user._id }).select('members owner').lean(),
    Lab.find({ $or: [{ head: user._id }, { members: user._id }] }).select('head members').lean(),
  ]);
  for (const p of projects) [...p.members, p.owner].forEach((m) => ids.add(str(m)));
  for (const l of labs) [l.head, ...l.members].forEach((m) => ids.add(str(m)));
  ids.delete(str(user._id));
  return ids;
}

export async function canReach(user, otherId) {
  return (await reachableIds(user)).has(str(otherId));
}

export const directKey = (a, b) => [str(a), str(b)].sort().join(':');

export const isMember = (conv, userId) => conv.members.some((m) => same(m, userId));
export const isAdmin = (conv, userId) => conv.type === 'GROUP' && (conv.admins ?? []).some((m) => same(m, userId));

/** Push a new message to every member's socket. */
export async function publishMessage(conv, message) {
  await pubsub.publish(EVENTS.MESSAGE_ADDED, { messageAdded: message, recipients: conv.members.map(str) });
}

/** Tell members (and anyone just removed) that a conversation's details or membership changed. */
export async function publishConversation(conv, extraRecipients = []) {
  const plain = typeof conv.toObject === 'function' ? conv.toObject() : conv;
  await pubsub.publish(EVENTS.CONVERSATION_CHANGED, {
    conversationChanged: plain,
    recipients: [...new Set([...plain.members.map(str), ...extraRecipients.map(str)])],
  });
}

/**
 * Persist and broadcast a message. Bumps lastMessageAt and marks it read for the sender.
 * Members with no ResearchMesh tab open get a Web Push notification instead.
 */
export async function postMessage(conv, { sender = null, body = '', kind = 'TEXT', attachment }) {
  const msg = await Message.create({ conversation: conv._id, sender, body, kind, attachment });
  await Conversation.updateOne({ _id: conv._id }, { lastMessageAt: msg.createdAt });
  if (sender) await markRead(conv._id, sender, msg.createdAt);
  const plain = msg.toObject();
  await publishMessage(conv, plain);

  if (sender && kind === 'TEXT') {
    const who = await User.findById(sender).select('name').lean();
    const preview = body ? (body.length > 140 ? `${body.slice(0, 140)}…` : body) : `📎 ${attachment?.name ?? 'Attachment'}`;
    const title = conv.type === 'GROUP' ? `${who?.name} in ${conv.name}` : who?.name;
    for (const m of conv.members) {
      if (!same(m, sender)) pushInBackground(m, { title, body: preview, url: `/messages/${conv._id}`, tag: `conv-${conv._id}` });
    }
  }
  return plain;
}

/** Record that `userId` has read up to `at`, and tell the other members (read receipts). */
export async function markRead(conversationId, userId, at = new Date()) {
  const res = await Conversation.updateOne({ _id: conversationId, 'reads.user': userId }, { $set: { 'reads.$.at': at } });
  if (!res.matchedCount) await Conversation.updateOne({ _id: conversationId }, { $push: { reads: { user: userId, at } } });
  const conv = await Conversation.findById(conversationId).select('members').lean();
  if (conv) {
    await pubsub.publish(EVENTS.CONVERSATION_READ, {
      conversationRead: { conversationId: str(conversationId), userId: str(userId), at },
      recipients: conv.members.map(str).filter((m) => m !== str(userId)),
    });
  }
}

/** Broadcast an edited / deleted / reacted message. */
export async function publishMessageUpdate(conv, message) {
  await pubsub.publish(EVENTS.MESSAGE_UPDATED, { messageUpdated: message, recipients: conv.members.map(str) });
}

/** Find or create the 1:1 conversation between two users. */
export async function getOrCreateDirect(a, b) {
  const key = directKey(a, b);
  const existing = await Conversation.findOne({ directKey: key });
  if (existing) return existing;
  try {
    return await Conversation.create({ type: 'DIRECT', directKey: key, members: [a, b], createdBy: a, reads: [{ user: a, at: new Date() }, { user: b, at: new Date(0) }] });
  } catch (e) {
    if (e.code === 11000) return Conversation.findOne({ directKey: key }); // created concurrently
    throw e;
  }
}

/** Add people to a group, post a system message, and notify sockets. */
export async function addToGroup(conv, userIds, actorName) {
  const fresh = userIds.map(str).filter((id) => !isMember(conv, id));
  if (!fresh.length) return conv;
  const updated = await Conversation.findByIdAndUpdate(
    conv._id,
    { $addToSet: { members: { $each: fresh } }, $push: { reads: { $each: fresh.map((u) => ({ user: u, at: new Date(0) })) } } },
    { new: true }
  );
  const names = (await User.find({ _id: { $in: fresh } }).select('name').lean()).map((u) => u.name);
  await postMessage(updated, { kind: 'SYSTEM', body: `${actorName} added ${names.join(', ')}` });
  await publishConversation(updated);
  return updated;
}

/** When someone joins a project, put them in the project's group chat if it has one. */
export async function syncProjectChat(projectId, userId, actorName) {
  const conv = await Conversation.findOne({ type: 'GROUP', project: projectId });
  if (conv) await addToGroup(conv, [userId], actorName);
}

/** When a student joins a lab, put them in the lab's group chat if it has one. */
export async function syncLabChat(labId, userId, actorName) {
  const conv = await Conversation.findOne({ type: 'GROUP', lab: labId, project: null });
  if (conv) await addToGroup(conv, [userId], actorName);
}
