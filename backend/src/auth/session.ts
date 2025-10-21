import { randomUUID } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSupabase } from '../db/supabase.js';
import { incrementRbacForbidden } from '../metrics.js';

export type Role = 'guardian' | 'teacher' | 'admin';

const SESSION_COOKIE_NAME = 'sid';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/'
};

function getTtlDays(): number {
  const raw = Number(process.env.SESSION_TTL_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

export async function createSession(reply: FastifyReply, userId: string) {
  const sb = getSupabase();
  const id = randomUUID();
  const ttlDays = getTtlDays();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  await sb.from('sessions').insert({
    id,
    user_id: userId,
    expires_at: expiresAt,
    revoked: false
  });
  reply.setCookie(SESSION_COOKIE_NAME, id, COOKIE_OPTIONS);
  return id;
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const sid = req.cookies?.[SESSION_COOKIE_NAME];
  if (!sid) {
    reply.clearCookie(SESSION_COOKIE_NAME, { path: COOKIE_OPTIONS.path });
    return;
  }
  const sb = getSupabase();
  await sb.from('sessions').update({ revoked: true }).eq('id', sid);
  reply.clearCookie(SESSION_COOKIE_NAME, { path: COOKIE_OPTIONS.path });
  (req as any).sessionUser = null;
}

async function loadSessionUser(req: FastifyRequest) {
  const sid = req.cookies?.[SESSION_COOKIE_NAME];
  if (!sid) return null;
  const sb = getSupabase();
  const { data: session, error } = await sb
    .from('sessions')
    .select('*')
    .eq('id', sid)
    .maybeSingle();
  if (error || !session) return null;
  if (session.revoked) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await sb.from('sessions').update({ revoked: true }).eq('id', sid);
    return null;
  }
  const { data: user, error: userError } = await sb
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .maybeSingle();
  if (userError || !user) return null;
  return user;
}

export async function getUserFromRequest(req: FastifyRequest) {
  if ('sessionUser' in (req as any)) {
    return (req as any).sessionUser;
  }
  const user = await loadSessionUser(req);
  (req as any).sessionUser = user ?? null;
  return user ?? null;
}

export async function getRoleFromRequest(req: FastifyRequest): Promise<Role | null> {
  const user = await getUserFromRequest(req);
  return (user?.role as Role) ?? null;
}

export async function requireRole(
  req: FastifyRequest,
  reply: FastifyReply,
  allowed: Role[]
) {
  const role = await getRoleFromRequest(req);
  if (!role || !allowed.includes(role)) {
    incrementRbacForbidden();
    reply.code(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

export const sessionCookieOptions = COOKIE_OPTIONS;
export const sessionCookieName = SESSION_COOKIE_NAME;
