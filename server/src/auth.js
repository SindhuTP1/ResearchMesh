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
