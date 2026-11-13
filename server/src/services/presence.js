import { Conversation } from '../models/index.js';
import { pubsub, EVENTS } from '../pubsub.js';

/**
 * Who is online right now = who has at least one open subscription WebSocket.
 * Counted per user because one person may have several tabs/devices open.
 * In-process only, like PubSub — use Redis for both when running several API instances.
 */
const sockets = new Map(); // userId → open socket count

export const isOnline = (userId) => (sockets.get(String(userId)) ?? 0) > 0;

/** People who should see this user's presence change: everyone they share a conversation with. */
async function watchersOf(userId) {
  const convs = await Conversation.find({ members: userId }).select('members').lean();
  const ids = new Set();
  for (const c of convs) for (const m of c.members) ids.add(String(m));
  ids.delete(String(userId));
  return [...ids];
}

async function announce(userId, online) {
  const recipients = await watchersOf(userId);
  if (recipients.length) await pubsub.publish(EVENTS.PRESENCE_CHANGED, { presenceChanged: { userId: String(userId), online }, recipients });
}

export function socketOpened(userId) {
  const id = String(userId);
  const n = (sockets.get(id) ?? 0) + 1;
  sockets.set(id, n);
  if (n === 1) announce(id, true).catch(() => {});
}

export function socketClosed(userId) {
  const id = String(userId);
  const n = Math.max(0, (sockets.get(id) ?? 0) - 1);
  if (n === 0) sockets.delete(id);
  else sockets.set(id, n);
  if (n === 0) announce(id, false).catch(() => {});
}
