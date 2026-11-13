import { PUSH_PUBLIC_KEY, SAVE_PUSH, REMOVE_PUSH } from './graphql/operations.js';

/**
 * Browser side of Web Push. The service worker (public/sw.js) displays the notifications;
 * this module registers it and stores the subscription on the server.
 */
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

let registration = null;
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  if (!registration) registration = await navigator.serviceWorker.register('/sw.js').catch(() => null);
  return registration;
}

const toUint8 = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export async function currentSubscription() {
  const reg = await registerServiceWorker();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission, subscribe this browser and tell the server. Returns 'enabled' | 'denied' | 'unsupported' | 'error'. */
export async function enablePush(client) {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
    const reg = await registerServiceWorker();
    const { data } = await client.query({ query: PUSH_PUBLIC_KEY, fetchPolicy: 'network-only' });
    if (!data?.pushPublicKey) return 'error';
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(data.pushPublicKey) }));
    await client.mutate({ mutation: SAVE_PUSH, variables: { subscription: JSON.stringify(sub.toJSON()) } });
    return 'enabled';
  } catch (e) {
    console.warn('push subscribe failed', e);
    return 'error';
  }
}

export async function disablePush(client) {
  const sub = await currentSubscription();
  if (!sub) return;
  await client.mutate({ mutation: REMOVE_PUSH, variables: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** While a tab is open but hidden, show a system notification for live events (the server only pushes when no tab is open). */
export async function notifyIfHidden(title, body, url) {
  if (document.visibilityState === 'visible' || !('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await registerServiceWorker();
  if (reg) reg.showNotification(title, { body, icon: '/icon.svg', tag: url, data: { url } });
}
