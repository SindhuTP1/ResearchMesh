/**
 * Zero-setup dev mode: starts an embedded MongoDB (no install needed), loads the university directory
 * the first time, then starts the API.
 *
 * Data is stored on disk in server/.devdata, so accounts, chats and files survive restarts.
 * Delete that folder (or run with DEV_DB_RESET=1) to start from a fresh directory again.
 */
import 'dotenv/config';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB } from './config/db.js';
import { createServer } from './app.js';
import { ensureAdminSignupCode } from './auth.js';
import { seed, seedIfEmpty } from './seed/seed.js';

// Only one copy can use the dev database folder. If the API port is taken, another copy is
// almost certainly running: say so plainly instead of crashing inside MongoDB startup.
const port = Number(process.env.PORT || 4000);
const portFree = await new Promise((resolve) => {
  const probe = net.createServer().once('error', () => resolve(false)).once('listening', () => probe.close(() => resolve(true)));
  probe.listen(port);
});
if (!portFree) {
  console.error(`\n❌ Port ${port} is already in use — ResearchMesh is probably already running in another terminal.`);
  console.error('   Use that one (http://localhost:5173), or stop it with Ctrl+C and start again.\n');
  process.exit(1);
}

const dbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.devdata');
fs.mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: { dbPath, storageEngine: 'wiredTiger' },
});
await connectDB(mongod.getUri('researchmesh'));
if (process.env.DEV_DB_RESET === '1') await seed({ quiet: false, small: true });
else await seedIfEmpty();
console.log(`💾 Dev database stored in ${dbPath} (kept between restarts)`);
ensureAdminSignupCode();
await createServer({ port, corsOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',') });

const shutdown = async () => {
  await mongod.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
