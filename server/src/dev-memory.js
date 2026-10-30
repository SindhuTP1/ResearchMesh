/**
 * Zero-setup dev mode: starts an in-memory MongoDB, seeds demo data, then starts the API.
 * Data is lost when the process stops. Use `npm run dev` with a real MONGODB_URI for persistence.
 */
import 'dotenv/config';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB } from './config/db.js';
import { createServer } from './app.js';
import { seed } from './seed/seed.js';

const mongod = await MongoMemoryServer.create();
await connectDB(mongod.getUri('researchmesh'));
await seed({ quiet: false });
await createServer({ port: Number(process.env.PORT || 4000), corsOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',') });

const shutdown = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
