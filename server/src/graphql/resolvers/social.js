/**
 * Connections, teammate search, chat and video-call signalling.
 *
 * Who can talk to whom: you can open a 1:1 chat with, or add to a group, anyone you are connected with,
 * anyone you share a project with, and anyone in your lab (see services/chat.js → reachableIds).
 * Connecting needs the other person to accept, except that accepting a project/lab join request (or an
 * invite) connects the two people automatically.
 */
import mongoose from 'mongoose';
import { withFilter } from 'graphql-subscriptions';
import { User, Project, Lab, JoinRequest, ConnectionRequest, Conversation, Message } from '../../models/index.js';
import { requireUser, forbidden, badInput, unauthenticated } from '../../auth.js';
import { notify, publishJoinRequest } from '../../services/notify.js';
import { rankTeammates } from '../../services/matching.js';
import { pubsub, EVENTS } from '../../pubsub.js';
import {
  connectUsers, reachableIds, canReach, getOrCreateDirect, isMember, isAdmin, postMessage, publishConversation,
  addToGroup, markRead, publishMessageUpdate,
} from '../../services/chat.js';
import { isOnline } from '../../services/presence.js';
import { publicKey, pushInBackground } from '../../services/push.js';
import { attachmentInfo, deleteAttachment } from '../../files.js';
import { PushSubscription } from '../../models/index.js';

export const REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏', '🔥', '✅'];

/**
 * STUN finds each browser's public address; TURN relays the media when the two networks can't
 * reach each other directly (college Wi-Fi, mobile data, strict NATs). Configure TURN with either
 *   ICE_SERVERS = JSON array of RTCIceServer objects, or
 *   TURN_URLS = comma-separated turn:/turns: URLs + TURN_USERNAME + TURN_CREDENTIAL
 */
const DEFAULT_STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
function iceServers() {
  const list = [...DEFAULT_STUN];
  if (process.env.ICE_SERVERS) {
    try {
      const extra = JSON.parse(process.env.ICE_SERVERS);
      for (const s of Array.isArray(extra) ? extra : [extra]) list.push({ ...s, urls: Array.isArray(s.urls) ? s.urls : [s.urls] });
    } catch {
      console.warn('ICE_SERVERS is not valid JSON — ignoring it');
    }
  }
  if (process.env.TURN_URLS) {
    list.push({
      urls: process.env.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME ?? null,
      credential: process.env.TURN_CREDENTIAL ?? null,
    });
  }
  return list;
}

async function loadMessageFor(ctx, id) {
  const me = requireUser(ctx);
  const msg = await Message.findById(oid(id));
  if (!msg) throw badInput('Message not found');
  const conv = await Conversation.findById(msg.conversation);
  if (!conv || !isMember(conv, me._id)) throw forbidden('You are not in this conversation');
  return { me, msg, conv };
}

const oid = (id) => {
  if (!mongoose.isValidObjectId(id)) throw badInput(`Invalid id: ${id}`);
  return new mongoose.Types.ObjectId(String(id));
};
const str = (id) => String(id);
const same = (a, b) => str(a) === str(b);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lower = (xs) => (xs ?? []).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
const clamp = (n, max) => Math.min(Math.max(1, n ?? 20), max);
const background = (p) => p.catch((e) => console.error('background task failed:', e));

async function loadConversationFor(ctx, id) {
  const me = requireUser(ctx);
  const conv = await Conversation.findById(oid(id));
  if (!conv || !isMember(conv, me._id)) throw forbidden('You are not in this conversation');
  return conv;
}

function requireGroupAdmin(conv, me) {
  if (conv.type !== 'GROUP') throw badInput('Only group chats have members to manage');
  if (!isAdmin(conv, me._id)) throw forbidden('Only the group admin can do this');
}

async function assertReachable(me, userIds) {
  const reach = await reachableIds(me);
  const blocked = userIds.filter((u) => !reach.has(str(u)));
  if (blocked.length) {
    const names = (await User.find({ _id: { $in: blocked } }).select('name').lean()).map((u) => u.name);
    throw forbidden(`You can only add people you're connected with or work with: ${names.join(', ') || 'unknown user'}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */
async function findTeammates(_, { input }, ctx) {
  const me = requireUser(ctx);
  const filter = { role: 'STUDENT', _id: { $ne: me._id } };
  const skills = lower(input.skills);
  const interests = lower(input.interests);
  if (skills.length) filter['skills.name'] = { $all: skills };
  if (interests.length) filter.interests = { $in: interests };
  if (input.departmentId) filter.department = oid(input.departmentId);
  if (input.years?.length) filter.yearOfStudy = { $in: input.years };
  if (input.programs?.length) filter.program = { $in: input.programs };
  if (input.lookingForTeam) filter.lookingFor = { $in: ['COLLABORATOR', 'PROJECT'] };
  if (input.name?.trim()) filter.name = new RegExp(escapeRegex(input.name.trim()), 'i');
  if (input.query?.trim()) {
    const rx = new RegExp(escapeRegex(input.query.trim()), 'i');
    filter.$or = [{ name: rx }, { 'skills.name': rx }, { interests: rx }, { program: rx }];
  }
  if (input.excludeConnected) filter._id = { $nin: [me._id, ...(me.connections ?? [])] };

  const candidates = await User.find(filter).limit(1000).lean().exec();
  const ranked = rankTeammates(me, candidates.map((c) => ({ id: c._id, skills: c.skills, interests: c.interests })), { limit: candidates.length });
  const byId = new Map(candidates.map((c) => [str(c._id), c]));
  // With no profile to match on, scores are all 0 — fall back to most recently active.
  if (ranked.every((r) => r.score === 0)) ranked.sort((a, b) => (byId.get(b.id).lastActiveAt ?? 0) - (byId.get(a.id).lastActiveAt ?? 0));
  const offset = Math.max(0, input.offset ?? 0);
  const page = ranked.slice(offset, offset + clamp(input.limit, 100));
  return { totalCount: ranked.length, items: page.map((r) => ({ ...r, student: byId.get(r.id) })) };
}

async function chatContacts(_, { search }, ctx) {
  const me = requireUser(ctx);
  const ids = [...(await reachableIds(me))];
  const f = { _id: { $in: ids } };
  if (search?.trim()) f.name = new RegExp(escapeRegex(search.trim()), 'i');
  return User.find(f).sort({ role: 1, name: 1 }).limit(200).lean().exec();
}

async function conversations(_, __, ctx) {
  const me = requireUser(ctx);
  return Conversation.find({ members: me._id }).sort({ lastMessageAt: -1 }).limit(200).lean().exec();
}

async function messages(_, { conversationId, before, limit }, ctx) {
  await loadConversationFor(ctx, conversationId);
  const n = clamp(limit, 100);
  const f = { conversation: oid(conversationId) };
  if (before) f.createdAt = { $lt: new Date(before) };
  const docs = await Message.find(f).sort({ createdAt: -1, _id: -1 }).limit(n + 1).lean().exec();
  return { items: docs.slice(0, n), hasMore: docs.length > n };
}

async function unreadMessageCount(_, __, ctx) {
  const me = requireUser(ctx);
  const convs = await Conversation.find({ members: me._id }).select('reads').lean();
  if (!convs.length) return 0;
  const counts = await Promise.all(convs.map((c) => ctx.loaders.unreadCount.load({ id: c._id, since: readAt(c, me._id) })));
  return counts.reduce((a, b) => a + b, 0);
}

const readAt = (conv, userId) => conv.reads?.find((r) => same(r.user, userId))?.at ?? new Date(0);

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */
async function acceptConnection(cr, me) {
  cr.status = 'ACCEPTED';
  await cr.save();
  await connectUsers(cr.from, cr.to);
  await notify({ recipient: cr.from, type: 'NEW_CONNECTION', message: `${me.name} accepted your connection request — you can message each other now`, actor: me._id });
  await pubsub.publish(EVENTS.CONNECTION_CHANGED, { recipients: [str(cr.from), str(cr.to)] });
}

const Mutation = {
  async sendConnectionRequest(_, { userId, message }, ctx) {
    const me = requireUser(ctx);
    const other = await User.findById(oid(userId)).lean();
    if (!other) throw badInput('User not found');
    if (same(other._id, me._id)) throw badInput("You can't connect with yourself");
    if (me.role === 'ADMIN' || other.role === 'ADMIN') throw badInput('Admins are not part of the network');
    if ((other.connections ?? []).some((c) => same(c, me._id))) return other;

    // They already asked me → this is an accept.
    const theirs = await ConnectionRequest.findOne({ from: other._id, to: me._id, status: 'PENDING' });
    if (theirs) {
      await acceptConnection(theirs, me);
      return User.findById(other._id).lean();
    }
    if (await ConnectionRequest.exists({ from: me._id, to: other._id, status: 'PENDING' })) throw badInput('Request already sent');
    const cr = await ConnectionRequest.create({ from: me._id, to: other._id, message: (message ?? '').slice(0, 500) });
    await notify({ recipient: other._id, type: 'CONNECTION_REQUEST', message: `${me.name} wants to connect${cr.message ? `: “${cr.message}”` : ''}`, actor: me._id });
    await pubsub.publish(EVENTS.CONNECTION_CHANGED, { recipients: [str(other._id)] });
    return other;
  },

  async respondToConnectionRequest(_, { id, accept }, ctx) {
    const me = requireUser(ctx);
    const cr = await ConnectionRequest.findById(oid(id));
    if (!cr || !same(cr.to, me._id)) throw forbidden('Not your request to answer');
    if (cr.status !== 'PENDING') throw badInput(`Request already ${cr.status.toLowerCase()}`);
    if (accept) await acceptConnection(cr, me);
    else {
      cr.status = 'REJECTED';
      await cr.save();
    }
    return cr.toObject();
  },

  async withdrawConnectionRequest(_, { id }, ctx) {
    const me = requireUser(ctx);
    const cr = await ConnectionRequest.findById(oid(id));
    if (!cr || !same(cr.from, me._id)) throw forbidden('Not your request');
    if (cr.status !== 'PENDING') throw badInput('Only pending requests can be withdrawn');
    cr.status = 'WITHDRAWN';
    await cr.save();
    return cr.toObject();
  },

  async removeConnection(_, { userId }, ctx) {
    const me = requireUser(ctx);
    const other = oid(userId);
    await Promise.all([
      User.updateOne({ _id: me._id }, { $pull: { connections: other } }),
      User.updateOne({ _id: other }, { $pull: { connections: me._id } }),
    ]);
    return User.findById(other).lean();
  },

  async inviteToProject(_, { projectId, userId, message }, ctx) {
    const me = requireUser(ctx);
    const p = await Project.findById(oid(projectId)).lean();
    if (!p) throw badInput('Project not found');
    if (!same(p.owner, me._id)) throw forbidden('Only the project owner can invite people');
    if (!p.isOpen) throw badInput('Reopen the project before inviting people');
    if (p.members.length >= p.maxMembers) throw badInput('Project is full');
    const invitee = await User.findById(oid(userId)).lean();
    if (!invitee || invitee.role === 'ADMIN') throw badInput('User not found');
    if (p.members.some((m) => same(m, invitee._id))) throw badInput(`${invitee.name} is already on this project`);
    const dup = await JoinRequest.exists({ project: p._id, status: 'PENDING', $or: [{ requester: invitee._id }, { recipient: invitee._id }] });
    if (dup) throw badInput(`There is already a pending request or invite for ${invitee.name}`);
    const jr = await JoinRequest.create({
      kind: 'INVITE', targetType: 'PROJECT', project: p._id, lab: p.lab ?? null,
      requester: me._id, recipient: invitee._id, message: (message ?? '').slice(0, 500),
    });
    await notify({ recipient: invitee._id, type: 'PROJECT_INVITE', message: `${me.name} invited you to join "${p.title}"`, actor: me._id, project: p._id, joinRequest: jr._id });
    await publishJoinRequest(jr);
    return jr.toObject();
  },

  async openDirectConversation(_, { userId }, ctx) {
    const me = requireUser(ctx);
    const other = oid(userId);
    if (same(other, me._id)) throw badInput("You can't message yourself");
    if (!(await canReach(me, other))) throw forbidden('Connect with this person first — chat opens once they accept');
    return (await getOrCreateDirect(me._id, other)).toObject();
  },

  async createGroupConversation(_, { input }, ctx) {
    const me = requireUser(ctx);
    if (me.role === 'ADMIN') throw forbidden('Admins do not take part in chats');
    const name = input.name.trim();
    if (!name) throw badInput('Give the group a name');
    const memberIds = [...new Set(input.memberIds.map(str))].filter((id) => !same(id, me._id));
    if (!memberIds.length) throw badInput('Add at least one person');
    if (memberIds.length > 100) throw badInput('Groups are limited to 100 people');
    await assertReachable(me, memberIds);
    const conv = await Conversation.create({
      type: 'GROUP', name, description: input.description ?? '', createdBy: me._id,
      members: [me._id, ...memberIds.map(oid)], admins: [me._id],
      reads: [{ user: me._id, at: new Date() }, ...memberIds.map((u) => ({ user: u, at: new Date(0) }))],
    });
    await postMessage(conv, { kind: 'SYSTEM', body: `${me.name} created the group “${name}”` });
    await publishConversation(conv);
    return conv.toObject();
  },

  async openProjectConversation(_, { projectId }, ctx) {
    const me = requireUser(ctx);
    const p = await Project.findById(oid(projectId)).lean();
    if (!p) throw badInput('Project not found');
    if (!p.members.some((m) => same(m, me._id)) && !same(p.owner, me._id)) throw forbidden('Only project members can open its chat');
    const everyone = [...new Set([str(p.owner), ...p.members.map(str)])];
    let conv = await Conversation.findOne({ type: 'GROUP', project: p._id });
    if (!conv) {
      conv = await Conversation.create({
        type: 'GROUP', name: p.title, description: `Team chat for the project “${p.title}”`, project: p._id, createdBy: me._id,
        members: everyone, admins: [p.owner], reads: everyone.map((u) => ({ user: u, at: same(u, me._id) ? new Date() : new Date(0) })),
      });
      await postMessage(conv, { kind: 'SYSTEM', body: `${me.name} started the team chat for “${p.title}”` });
      await publishConversation(conv);
    } else {
      conv = await addToGroup(conv, everyone, me.name); // anyone who joined since
    }
    return conv.toObject();
  },

  async openLabConversation(_, { labId }, ctx) {
    const me = requireUser(ctx);
    const l = await Lab.findById(oid(labId)).lean();
    if (!l) throw badInput('Lab not found');
    if (!same(l.head, me._id) && !l.members.some((m) => same(m, me._id))) throw forbidden('Only lab members can open its chat');
    const everyone = [...new Set([str(l.head), ...l.members.map(str)])];
    let conv = await Conversation.findOne({ type: 'GROUP', lab: l._id, project: null });
    if (!conv) {
      conv = await Conversation.create({
        type: 'GROUP', name: l.name, description: `Everyone in ${l.name}`, lab: l._id, createdBy: me._id,
        members: everyone, admins: [l.head], reads: everyone.map((u) => ({ user: u, at: same(u, me._id) ? new Date() : new Date(0) })),
      });
      await postMessage(conv, { kind: 'SYSTEM', body: `${me.name} started the lab group` });
      await publishConversation(conv);
    } else {
      conv = await addToGroup(conv, everyone, me.name);
    }
    return conv.toObject();
  },

  async addConversationMembers(_, { conversationId, userIds }, ctx) {
    const me = requireUser(ctx);
    const conv = await loadConversationFor(ctx, conversationId);
    requireGroupAdmin(conv, me);
    const ids = [...new Set(userIds.map(str))];
    await assertReachable(me, ids);
    return (await addToGroup(conv, ids, me.name)).toObject();
  },

  async removeConversationMember(_, { conversationId, userId }, ctx) {
    const me = requireUser(ctx);
    const conv = await loadConversationFor(ctx, conversationId);
    requireGroupAdmin(conv, me);
    if (same(userId, me._id)) throw badInput('Use “Leave group” to remove yourself');
    if (!isMember(conv, userId)) throw badInput('Not a member');
    const removed = await User.findById(oid(userId)).select('name').lean();
    const updated = await Conversation.findByIdAndUpdate(conv._id, { $pull: { members: oid(userId), admins: oid(userId) } }, { new: true });
    await postMessage(updated, { kind: 'SYSTEM', body: `${me.name} removed ${removed?.name ?? 'a member'}` });
    await publishConversation(updated, [userId]);
    return updated.toObject();
  },

  async leaveConversation(_, { conversationId }, ctx) {
    const me = requireUser(ctx);
    const conv = await loadConversationFor(ctx, conversationId);
    if (conv.type !== 'GROUP') throw badInput("You can't leave a direct chat");
    const remaining = conv.members.filter((m) => !same(m, me._id));
    let admins = (conv.admins ?? []).filter((m) => !same(m, me._id));
    if (!admins.length && remaining.length) admins = [remaining[0]]; // hand over admin so the group stays manageable
    const updated = await Conversation.findByIdAndUpdate(conv._id, { members: remaining, admins }, { new: true });
    if (remaining.length) await postMessage(updated, { kind: 'SYSTEM', body: `${me.name} left the group` });
    await publishConversation(updated, [me._id]);
    return true;
  },

  async updateConversation(_, { conversationId, name, description }, ctx) {
    const me = requireUser(ctx);
    const conv = await loadConversationFor(ctx, conversationId);
    requireGroupAdmin(conv, me);
    if (name != null) {
      if (!name.trim()) throw badInput('Name cannot be empty');
      conv.name = name.trim().slice(0, 80);
    }
    if (description != null) conv.description = description.slice(0, 500);
    await conv.save();
    await publishConversation(conv);
    return conv.toObject();
  },

  async sendMessage(_, { conversationId, body, attachmentId }, ctx) {
    const me = requireUser(ctx);
    const conv = await loadConversationFor(ctx, conversationId);
    const text = (body ?? '').trim();
    if (text.length > 4000) throw badInput('Messages are limited to 4000 characters');
    let attachment;
    if (attachmentId) {
      const f = await attachmentInfo(attachmentId);
      if (!f || !same(f.metadata?.uploader, me._id) || !same(f.metadata?.conversation, conv._id)) throw badInput('Upload the file to this conversation first');
      attachment = { fileId: f._id, name: f.filename, mime: f.metadata?.mime ?? 'application/octet-stream', size: f.length };
    }
    if (!text && !attachment) throw badInput('Message is empty');
    // A direct chat stays usable only while the two people can still reach each other.
    if (conv.type === 'DIRECT') {
      const other = conv.members.find((m) => !same(m, me._id));
      if (other && !(await canReach(me, other))) throw forbidden('You are no longer connected with this person');
    }
    return postMessage(conv, { sender: me._id, body: text, attachment });
  },

  async editMessage(_, { id, body }, ctx) {
    const { me, msg, conv } = await loadMessageFor(ctx, id);
    if (!same(msg.sender, me._id)) throw forbidden('You can only edit your own messages');
    if (msg.deletedAt) throw badInput('This message was deleted');
    const text = body.trim();
    if (!text && !msg.attachment) throw badInput('Message is empty — delete it instead');
    if (text.length > 4000) throw badInput('Messages are limited to 4000 characters');
    if (text === msg.body) return msg.toObject();
    msg.body = text;
    msg.editedAt = new Date();
    await msg.save();
    await publishMessageUpdate(conv, msg.toObject());
    return msg.toObject();
  },

  async deleteMessage(_, { id }, ctx) {
    const { me, msg, conv } = await loadMessageFor(ctx, id);
    if (msg.kind !== 'TEXT') throw badInput("System messages can't be deleted");
    if (!same(msg.sender, me._id) && !isAdmin(conv, me._id)) throw forbidden('You can only delete your own messages');
    if (msg.deletedAt) return msg.toObject();
    if (msg.attachment?.fileId) await deleteAttachment(msg.attachment.fileId);
    msg.body = '';
    msg.attachment = undefined;
    msg.reactions = [];
    msg.deletedAt = new Date();
    await msg.save();
    await publishMessageUpdate(conv, msg.toObject());
    return msg.toObject();
  },

  async toggleReaction(_, { messageId, emoji }, ctx) {
    const { me, msg, conv } = await loadMessageFor(ctx, messageId);
    if (!REACTIONS.includes(emoji)) throw badInput(`React with one of ${REACTIONS.join(' ')}`);
    if (msg.deletedAt || msg.kind !== 'TEXT') throw badInput("You can't react to this message");
    const r = msg.reactions.find((x) => x.emoji === emoji);
    if (!r) msg.reactions.push({ emoji, users: [me._id] });
    else if (r.users.some((u) => same(u, me._id))) r.users = r.users.filter((u) => !same(u, me._id));
    else r.users.push(me._id);
    msg.reactions = msg.reactions.filter((x) => x.users.length > 0);
    await msg.save();
    await publishMessageUpdate(conv, msg.toObject());
    return msg.toObject();
  },

  async setTyping(_, { conversationId, typing }, ctx) {
    const me = requireUser(ctx);
    const conv = await loadConversationFor(ctx, conversationId);
    await pubsub.publish(EVENTS.TYPING, {
      typing: { conversationId: str(conv._id), user: me._id, typing },
      recipients: conv.members.map(str).filter((m) => !same(m, me._id)),
    });
    return true;
  },

  async savePushSubscription(_, { subscription }, ctx) {
    const me = requireUser(ctx);
    let sub;
    try { sub = JSON.parse(subscription); } catch { throw badInput('Invalid subscription'); }
    if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) throw badInput('Invalid subscription');
    await PushSubscription.updateOne({ endpoint: sub.endpoint }, { user: me._id, keys: sub.keys }, { upsert: true });
    return true;
  },

  async removePushSubscription(_, { endpoint }, ctx) {
    const me = requireUser(ctx);
    await PushSubscription.deleteOne({ endpoint, user: me._id });
    return true;
  },

  async markConversationRead(_, { conversationId }, ctx) {
    const me = requireUser(ctx);
    const conv = await loadConversationFor(ctx, conversationId);
    await markRead(conv._id, me._id);
    return Conversation.findById(conv._id).lean();
  },

  /**
   * WebRTC signalling relay. The server never sees media — it forwards offers/answers/ICE candidates
   * between conversation members over their existing subscription sockets.
   */
  async sendCallSignal(_, { input }, ctx) {
    const me = requireUser(ctx);
    const conv = await loadConversationFor(ctx, input.conversationId);
    if (input.payload && input.payload.length > 64_000) throw badInput('Signal payload too large');
    if (input.to && !isMember(conv, input.to)) throw badInput('That person is not in this conversation');
    const recipients = input.to ? [str(input.to)] : conv.members.map(str).filter((m) => !same(m, me._id));
    if (input.type === 'RING') {
      let audioOnly = false;
      try { audioOnly = !!JSON.parse(input.payload ?? '{}')?.audioOnly; } catch { /* ignore */ }
      background(postMessage(conv, { kind: 'SYSTEM', body: `${audioOnly ? '📞' : '📹'} ${me.name} started a ${audioOnly ? 'voice' : 'video'} call` }));
      // Members with no tab open get a push so they know they missed / can join the call.
      for (const m of recipients) pushInBackground(m, { title: `${audioOnly ? '📞 Voice' : '📹 Video'} call from ${me.name}`, body: conv.type === 'GROUP' ? `in ${conv.name}` : 'Open ResearchMesh to join', url: `/messages/${conv._id}`, tag: `call-${input.callId}` });
    }
    await pubsub.publish(EVENTS.CALL_SIGNAL, {
      callSignal: { conversationId: str(conv._id), callId: input.callId, type: input.type, to: input.to ?? null, payload: input.payload ?? null, from: me._id },
      recipients,
    });
    return true;
  },
};

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                              */
/* -------------------------------------------------------------------------- */
const forRecipients = (event) => ({
  subscribe: (root, args, ctx, info) => {
    if (!ctx.user) throw unauthenticated('Subscriptions require a token in connectionParams.authorization');
    return withFilter(() => pubsub.asyncIterableIterator(event), (payload, _a, c) => payload.recipients.includes(c.user.id))(root, args, ctx, info);
  },
});

const Subscription = {
  messageAdded: forRecipients(EVENTS.MESSAGE_ADDED),
  conversationChanged: forRecipients(EVENTS.CONVERSATION_CHANGED),
  callSignal: forRecipients(EVENTS.CALL_SIGNAL),
  messageUpdated: forRecipients(EVENTS.MESSAGE_UPDATED),
  typing: forRecipients(EVENTS.TYPING),
  conversationRead: forRecipients(EVENTS.CONVERSATION_READ),
  presenceChanged: forRecipients(EVENTS.PRESENCE_CHANGED),
};

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */
const types = {
  ConnectionRequest: {
    id: (r) => str(r._id),
    from: (r, _, { loaders }) => loaders.user.load(r.from),
    to: (r, _, { loaders }) => loaders.user.load(r.to),
  },
  Conversation: {
    id: (c) => str(c._id),
    title: async (c, _, { loaders, user }) => {
      if (c.type === 'GROUP') return c.name || 'Group';
      const other = c.members.find((m) => !same(m, user._id));
      return (other && (await loaders.user.load(other))?.name) || 'Conversation';
    },
    members: async (c, _, { loaders }) => (await loaders.user.loadMany(c.members.map(str))).filter((u) => u && !(u instanceof Error)),
    memberCount: (c) => c.members.length,
    admins: async (c, _, { loaders }) => (await loaders.user.loadMany((c.admins ?? []).map(str))).filter((u) => u && !(u instanceof Error)),
    createdBy: (c, _, { loaders }) => (c.createdBy ? loaders.user.load(c.createdBy) : null),
    otherUser: (c, _, { loaders, user }) => {
      if (c.type !== 'DIRECT') return null;
      const other = c.members.find((m) => !same(m, user._id));
      return other ? loaders.user.load(other) : null;
    },
    project: (c, _, { loaders }) => (c.project ? loaders.project.load(c.project) : null),
    lab: (c, _, { loaders }) => (c.lab ? loaders.lab.load(c.lab) : null),
    lastMessage: (c, _, { loaders }) => loaders.lastMessage.load(c._id),
    unreadCount: (c, _, { loaders, user }) => loaders.unreadCount.load({ id: c._id, since: readAt(c, user._id) }),
    canManage: (c, _, { user }) => isAdmin(c, user._id),
    readBy: (c) => (c.reads ?? []).filter((r) => r.at && r.at.getTime() > 0 && c.members.some((m) => same(m, r.user))),
  },
  ReadReceipt: {
    user: (r, _, { loaders }) => loaders.user.load(r.user),
  },
  TypingEvent: {
    user: (t, _, { loaders }) => loaders.user.load(t.user),
  },
  Attachment: {
    id: (a) => str(a.fileId),
    isImage: (a) => /^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(a.mime ?? ''),
    url: (a) => `/api/files/${a.fileId}`,
  },
  Reaction: {
    count: (r) => r.users.length,
    users: async (r, _, { loaders }) => (await loaders.user.loadMany(r.users.map(str))).filter((u) => u && !(u instanceof Error)),
    mine: (r, _, { user }) => r.users.some((u) => same(u, user?._id)),
  },
  Message: {
    id: (m) => str(m._id),
    conversationId: (m) => str(m.conversation),
    sender: (m, _, { loaders }) => (m.sender ? loaders.user.load(m.sender) : null),
    body: (m) => (m.deletedAt ? '' : m.body ?? ''),
    attachment: (m) => (m.deletedAt || !m.attachment?.fileId ? null : m.attachment),
    reactions: (m) => (m.deletedAt ? [] : m.reactions ?? []),
    isDeleted: (m) => !!m.deletedAt,
  },
  CallSignal: {
    from: (s, _, { loaders }) => loaders.user.load(s.from),
  },
};

/** Extra User fields that depend on the caller. */
export const userSocialFields = {
  connectionStatus: async (u, _, { user, loaders }) => {
    if (!user) return 'NONE';
    if (same(u._id, user._id)) return 'SELF';
    if ((u.connections ?? []).some((c) => same(c, user._id))) return 'CONNECTED';
    const pending = await loaders.pendingConnectionWith.load(u._id);
    if (!pending) return 'NONE';
    return same(pending.from, user._id) ? 'OUTGOING' : 'INCOMING';
  },
  isOnline: (u) => isOnline(u._id),
  pendingConnectionRequestId: async (u, _, { user, loaders }) => {
    if (!user || same(u._id, user._id)) return null;
    const pending = await loaders.pendingConnectionWith.load(u._id);
    return pending ? str(pending._id) : null;
  },
};

export const social = {
  Query: {
    findTeammates,
    chatContacts,
    conversations,
    conversation: async (_, { id }, ctx) => (await loadConversationFor(ctx, id)).toObject(),
    messages,
    unreadMessageCount,
    pushPublicKey: () => publicKey().catch(() => null),
    iceServers: (_, __, ctx) => {
      requireUser(ctx);
      return iceServers();
    },
    /** Dashboard "find people": students and faculty whose name contains the text. Never admins or yourself. */
    findPeople: (_, { name, role, limit }, ctx) => {
      const me = requireUser(ctx);
      const text = (name ?? '').trim().slice(0, 60);
      if (text.length < 2) return [];
      const roles = role && role !== 'ADMIN' ? [role] : ['STUDENT', 'FACULTY'];
      return User.find({ _id: { $ne: me._id }, role: { $in: roles }, name: new RegExp(escapeRegex(text), 'i') })
        .sort({ name: 1 }).limit(clamp(limit ?? 8, 20)).lean().exec();
    },
    myConnections: async (_, __, ctx) => {
      const me = requireUser(ctx);
      const fresh = await User.findById(me._id).select('connections').lean();
      return User.find({ _id: { $in: fresh?.connections ?? [] } }).sort({ name: 1 }).lean().exec();
    },
    connectionRequests: (_, { direction }, ctx) => {
      const me = requireUser(ctx);
      const f = direction === 'INCOMING' ? { to: me._id } : { from: me._id };
      return ConnectionRequest.find({ ...f, status: 'PENDING' }).sort({ createdAt: -1 }).limit(100).lean().exec();
    },
  },
  Mutation,
  Subscription,
  types,
};
