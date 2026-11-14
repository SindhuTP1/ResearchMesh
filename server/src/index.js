import 'dotenv/config';
import { connectDB } from './config/db.js';
import { createServer } from './app.js';
import { ensureAdminSignupCode } from './auth.js';
import { ensureDepartments } from './seed/seed.js';

const { MONGODB_URI = 'mongodb://127.0.0.1:27017/researchmesh', PORT = 4000, CLIENT_ORIGIN = 'http://localhost:5180' } = process.env;

// In production, refuse to start with missing or unsafe settings instead of silently using dev defaults.
if (process.env.NODE_ENV === 'production') {
  const problems = [];
  if (!process.env.MONGODB_URI) problems.push('MONGODB_URI is not set (use your MongoDB Atlas connection string)');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be set to a random string of at least 32 characters');
  if (!process.env.ADMIN_SIGNUP_CODE || process.env.ADMIN_SIGNUP_CODE.length < 8) problems.push('ADMIN_SIGNUP_CODE must be set (8+ characters) so only you can create the admin account');
  if (problems.length) {
    console.error(`\n❌ Not starting — fix these environment variables:\n   - ${problems.join('\n   - ')}\n`);
    process.exit(1);
  }
  if (!process.env.TURN_URLS && !process.env.ICE_SERVERS) {
    console.warn('⚠️  No TURN server configured (TURN_URLS / ICE_SERVERS). Calls between different networks may fail to connect.');
  }
}

await connectDB(MONGODB_URI);
await ensureDepartments();
ensureAdminSignupCode();
await createServer({ port: Number(PORT), corsOrigin: CLIENT_ORIGIN.split(',') });
