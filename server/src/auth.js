import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';
import { User } from './models/index.js';

const SECRET = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';

export const ROLE_RANK = { STUDENT: 1, FACULTY: 2, ADMIN: 3 };

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, SECRET(), { expiresIn: '7d' });
}

/** Resolve the current user from a "Bearer <jwt>" header or raw token. Returns null if missing/invalid. */
export async function userFromToken(authHeader) {
  if (!authHeader) return null;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    const payload = jwt.verify(token, SECRET());
    const user = await User.findById(payload.sub).lean();
    return user ? { ...user, id: String(user._id) } : null;
  } catch {
    return null;
  }
}

export function unauthenticated(msg = 'You must be logged in') {
  return new GraphQLError(msg, { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
}

export function forbidden(msg = 'You do not have permission to do this') {
  return new GraphQLError(msg, { extensions: { code: 'FORBIDDEN', http: { status: 403 } } });
}

export function badInput(msg) {
  return new GraphQLError(msg, { extensions: { code: 'BAD_USER_INPUT' } });
}

export function requireUser(ctx) {
  if (!ctx.user) throw unauthenticated();
  return ctx.user;
}

export function hasRole(user, role) {
  return !!user && ROLE_RANK[user.role] >= ROLE_RANK[role];
}

/**
 * Admin accounts can only be created with the access code in ADMIN_SIGNUP_CODE.
 * If it isn't configured, a one-off code is generated at startup and printed to the server console,
 * so whoever runs the server (and only they) can create the first admin.
 */
export function ensureAdminSignupCode({ log = true } = {}) {
  if (!process.env.ADMIN_SIGNUP_CODE) {
    process.env.ADMIN_SIGNUP_CODE = `RM-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    if (log) {
      console.log(`\n🔑 Admin sign-up code (valid until the server restarts): ${process.env.ADMIN_SIGNUP_CODE}`);
      console.log('   Set ADMIN_SIGNUP_CODE in server/.env to make it permanent.\n');
    }
  }
  return process.env.ADMIN_SIGNUP_CODE;
}

export function checkAdminSignupCode(code) {
  const expected = process.env.ADMIN_SIGNUP_CODE;
  if (!expected || !code) return false;
  const a = Buffer.from(String(code).trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
