import { PubSub } from 'graphql-subscriptions';

/**
 * In-memory PubSub — fine for a single Node process.
 * For horizontal scaling swap for `graphql-redis-subscriptions` (RedisPubSub) — same interface.
 */
export const pubsub = new PubSub();

export const EVENTS = {
  NOTIFICATION_ADDED: 'NOTIFICATION_ADDED',
  JOIN_REQUEST_CHANGED: 'JOIN_REQUEST_CHANGED',
  MESSAGE_ADDED: 'MESSAGE_ADDED',
  CONVERSATION_CHANGED: 'CONVERSATION_CHANGED',
  CALL_SIGNAL: 'CALL_SIGNAL',
  CONNECTION_CHANGED: 'CONNECTION_CHANGED',
  MESSAGE_UPDATED: 'MESSAGE_UPDATED',
  TYPING: 'TYPING',
  CONVERSATION_READ: 'CONVERSATION_READ',
  PRESENCE_CHANGED: 'PRESENCE_CHANGED',
};
