import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';

/**
 * Counts MongoDB round-trips per GraphQL request.
 * Every request runs inside `als.run({ count: 0 })`; mongoose's debug hook increments the counter.
 * The count is returned in `extensions.dbQueries` so you can watch DataLoader turn N+1 into ~1 per type.
 */
export const als = new AsyncLocalStorage();

export function installQueryCounter() {
  mongoose.set('debug', (collection, method) => {
    const store = als.getStore();
    if (store) {
      store.count += 1;
      store.log.push(`${collection}.${method}`);
    }
  });
}

export function newStore() {
  return { count: 0, log: [] };
}

/** Apollo plugin that attaches the count to the response. */
export const queryCountPlugin = {
  async requestDidStart() {
    return {
      async willSendResponse({ response, contextValue }) {
        const store = contextValue?.queryStore;
        if (!store || response.body.kind !== 'single') return;
        response.body.singleResult.extensions = {
          ...(response.body.singleResult.extensions || {}),
          dbQueries: store.count,
          dataloader: contextValue.batching ? 'on' : 'off',
          ...(process.env.LOG_QUERIES === 'true' ? { dbQueryLog: store.log } : {}),
        };
      },
    };
  },
};
