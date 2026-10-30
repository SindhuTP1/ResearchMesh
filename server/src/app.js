import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { buildSchema } from './graphql/schema.js';
import { createLoaders } from './graphql/loaders.js';
import { userFromToken } from './auth.js';
import { als, newStore, installQueryCounter, queryCountPlugin } from './queryCounter.js';

/**
 * Builds the Express + Apollo + graphql-ws stack. HTTP queries/mutations and WebSocket subscriptions
 * share the same port and the same `/graphql` path.
 */
export async function createServer({ port = 4000, corsOrigin = '*' } = {}) {
  installQueryCounter();
  const schema = buildSchema();
  const app = express();
  const httpServer = http.createServer(app);

  // --- WebSocket server for subscriptions (graphql-ws protocol) ---
  const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
  const wsCleanup = useServer(
    {
      schema,
      // Authenticate once per socket from connectionParams; context is rebuilt per operation.
      onConnect: async (ctx) => {
        ctx.extra.user = await userFromToken(ctx.connectionParams?.authorization);
        return true; // allow anonymous sockets; protected subscriptions reject in their resolver
      },
      context: async (ctx) => {
        const user = ctx.extra.user ?? null;
        return { user, loaders: createLoaders({ userId: user?._id }), batching: true };
      },
    },
    wsServer
  );

  const apollo = new ApolloServer({
    schema,
    introspection: true,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      { async serverWillStart() { return { async drainServer() { await wsCleanup.dispose(); } }; } },
      queryCountPlugin,
    ],
    formatError: (formatted, err) => {
      if (process.env.NODE_ENV === 'production' && formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        console.error(err);
        return { message: 'Internal server error', extensions: { code: 'INTERNAL_SERVER_ERROR' } };
      }
      return formatted;
    },
  });
  await apollo.start();

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use(
    '/graphql',
    cors({ origin: corsOrigin, credentials: true }),
    express.json({ limit: '1mb' }),
    // Every request runs in its own AsyncLocalStorage scope so we can count DB queries per request.
    (req, _res, next) => als.run(newStore(), next),
    expressMiddleware(apollo, {
      context: async ({ req }) => {
        const user = await userFromToken(req.headers.authorization);
        // `x-dataloader: off` disables batching for this request — use it to demo the N+1 problem.
        const batching = req.headers['x-dataloader'] !== 'off';
        return { user, loaders: createLoaders({ batching, userId: user?._id }), batching, queryStore: als.getStore() };
      },
    })
  );

  await new Promise((resolve) => httpServer.listen(port, resolve));
  const addr = httpServer.address();
  const actualPort = typeof addr === 'object' ? addr.port : port;
  console.log(`🚀 GraphQL HTTP   → http://localhost:${actualPort}/graphql`);
  console.log(`🔌 Subscriptions  → ws://localhost:${actualPort}/graphql`);

  return {
    app,
    httpServer,
    port: actualPort,
    async stop() {
      await apollo.stop();
      httpServer.close();
    },
  };
}
