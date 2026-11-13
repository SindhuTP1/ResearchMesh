import webpush from 'web-push';
import { PushSubscription, Setting } from '../models/index.js';
import { isOnline } from './presence.js';

/**
 * Web Push: notifications that reach the user when no ResearchMesh tab is open.
 *
 * VAPID keys identify this server to the browser push services. They come from VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY if set; otherwise they're generated once and stored in MongoDB (Setting "vapid"),
 * so existing browser subscriptions keep working across restarts.
 */
let keys = null;

export async function initPush() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const stored = await Setting.findOne({ key: 'vapid' }).lean();
    if (stored?.value?.publicKey) keys = stored.value;
    else {
      keys = webpush.generateVAPIDKeys();
      await Setting.updateOne({ key: 'vapid' }, { value: keys }, { upsert: true });
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@researchmesh.local', keys.publicKey, keys.privateKey);
  return keys;
}

export async function publicKey() {
  return (await initPush()).publicKey;
}

/**
 * Send a push to every browser the user registered — but only when they're offline (no open socket).
 * If they have a tab open, the in-app toast / live update already told them.
 */
export async function pushToUser(userId, payload, { evenIfOnline = false } = {}) {
  if (!evenIfOnline && isOnline(userId)) return 0;
  const subs = await PushSubscription.find({ user: userId }).lean();
  if (!subs.length) return 0;
  await initPush();
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 60 * 60 });
        sent += 1;
      } catch (e) {
        // 404/410: the browser dropped this subscription — forget it.
        if (e.statusCode === 404 || e.statusCode === 410) await PushSubscription.deleteOne({ _id: s._id });
      }
    })
  );
  return sent;
}

export const pushInBackground = (userId, payload) => pushToUser(userId, payload).catch((e) => console.warn('push failed:', e.message));
