import { PubSub } from 'graphql-subscriptions';

/**
 * In-memory PubSub — fine for a single Node process.
 * For horizontal scaling swap for `graphql-redis-subscriptions` (RedisPubSub) — same interface.
 */
export const pubsub = new PubSub();

export const EVENTS = {
  NOTIFICATION_ADDED: 'NOTIFICATION_ADDED',
  JOIN_REQUEST_CHANGED: 'JOIN_REQUEST_CHANGED',
};
