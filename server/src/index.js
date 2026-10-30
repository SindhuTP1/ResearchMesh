import 'dotenv/config';
import { connectDB } from './config/db.js';
import { createServer } from './app.js';

const { MONGODB_URI = 'mongodb://127.0.0.1:27017/researchmesh', PORT = 4000, CLIENT_ORIGIN = 'http://localhost:5173' } = process.env;

await connectDB(MONGODB_URI);
await createServer({ port: Number(PORT), corsOrigin: CLIENT_ORIGIN.split(',') });
