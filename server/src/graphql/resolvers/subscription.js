import { withFilter } from 'graphql-subscriptions';
import { pubsub, EVENTS } from '../../pubsub.js';
import { unauthenticated } from '../../auth.js';

/** Throws if the WebSocket connection wasn't authenticated with a valid token in connectionParams. */
const authed = (fn) => (root, args, ctx, info) => {
  if (!ctx.user) throw unauthenticated('Subscriptions require a token in connectionParams.authorization');
  return fn(root, args, ctx, info);
};

export const Subscription = {
  notificationAdded: {
    // withFilter: every server event is checked, but only the recipient's socket receives it.
    subscribe: authed(
      withFilter(
        () => pubsub.asyncIterableIterator(EVENTS.NOTIFICATION_ADDED),
        (payload, _args, ctx) => String(payload.notificationAdded.recipient) === ctx.user.id
      )
    ),
  },
  joinRequestChanged: {
    subscribe: authed(
      withFilter(
        () => pubsub.asyncIterableIterator(EVENTS.JOIN_REQUEST_CHANGED),
        (payload, _args, ctx) => {
          const jr = payload.joinRequestChanged;
          return String(jr.requester) === ctx.user.id || String(jr.recipient) === ctx.user.id;
        }
      )
    ),
  },
};
