/**
 * Remove every student and faculty account, and everything that belongs to them, so real users can
 * sign up from scratch. Departments, the admin account and server settings (push keys) are kept.
 *
 *   npm run reset:people            (from the ResearchMesh folder)
 *
 * Before deleting anything, every collection is saved as Extended JSON under ResearchMesh/backups/<time>/,
 * so the previous state can be inspected or restored with mongoimport.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { User, Notification, ConnectionRequest } from '../models/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Save every collection of the connected database to backups/<timestamp>/<collection>.json. */
export async function backupDatabase(label = 'backup') {
  const db = mongoose.connection.db;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.resolve(here, '../../../backups', `${stamp}-${label}`);
  fs.mkdirSync(dir, { recursive: true });
  const { EJSON } = mongoose.mongo.BSON;
  for (const { name } of await db.listCollections().toArray()) {
    const docs = await db.collection(name).find().toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), docs.map((d) => EJSON.stringify(d, { relaxed: false })).join('\n'));
  }
  return dir;
}

export async function resetPeople({ quiet = false, backup = true } = {}) {
  const log = (...a) => !quiet && console.log(...a);
  const db = mongoose.connection.db;
  if (backup) log(`💾 Backup saved to ${await backupDatabase('before-reset-people')}`);

  const people = await User.find({ role: { $in: ['STUDENT', 'FACULTY'] } }).select('_id email').lean();
  const ids = people.map((p) => p._id);
  const drop = async (name, filter = {}) => {
    const exists = (await db.listCollections({ name }).toArray()).length > 0;
    return exists ? (await db.collection(name).deleteMany(filter)).deletedCount : 0;
  };

  // Everything below belongs to students/faculty (labs, projects, chats…) — none of it is admin data.
  const removed = {
    people: (await User.deleteMany({ _id: { $in: ids } })).deletedCount,
    labs: await drop('labs'),
    projects: await drop('projects'),
    publications: await drop('publications'),
    grants: await drop('grants'),
    joinRequests: await drop('joinrequests'),
    connectionRequests: (await ConnectionRequest.deleteMany({})).deletedCount,
    conversations: await drop('conversations'),
    messages: await drop('messages'),
    files: await drop('attachments.files'),
    fileChunks: await drop('attachments.chunks'),
    pushSubscriptions: await drop('pushsubscriptions', { user: { $in: ids } }),
    notifications: (await Notification.deleteMany({ $or: [{ recipient: { $in: ids } }, { actor: { $in: ids } }] })).deletedCount,
  };
  // The admin (if any) keeps their account but loses links to people who no longer exist.
  await User.updateMany({}, { $set: { connections: [], lab: null } });
  log('🧹 Removed:', removed);
  return removed;
}

// Run directly: node src/seed/resetPeople.js
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/researchmesh');
  console.log(`Database: ${mongoose.connection.name} on ${mongoose.connection.host}`);
  await resetPeople();
  const left = await User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]);
  console.log('Accounts left:', left.length ? Object.fromEntries(left.map((r) => [r._id, r.n])) : 'none');
  await mongoose.disconnect();
}
