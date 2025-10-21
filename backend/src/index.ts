import Fastify from 'fastify';
import cors from '@fastify/cors';
import formbody from '@fastify/formbody';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import dotenv from 'dotenv'; dotenv.config();
import { EmailMagicAuth } from './auth/EmailMagicAuth.js';
import type { Role } from './auth/session.js';
import { createSession, destroySession, getUserFromRequest, requireRole, sessionCookieName } from './auth/session.js';
import { BankIdAuth } from './auth/BankIdAuth.js';
import { getEmailProvider } from './services/EmailService.js';
import { sendPush } from './services/PushService.js';
import { listEvents, createEvent, deleteEvent } from './repos/eventsRepo.js';
import { listMessages, postMessage } from './repos/messagesRepo.js';
import { registerDevice, getClassTokens } from './repos/devicesRepo.js';
import { createInvitation, getInvitationByToken, markInvitationUsed } from './repos/invitationsRepo.js';
import { getUserByEmail, hasAdminUser, updateUserRole, upsertUserByEmail } from './repos/usersRepo.js';
import { ensureDefaultClass, getClassByCode } from './repos/classesRepo.js';
import { startReminderWorkerSupabase, getRemindersHealth } from './util/remindersSupabase.js';
import { moderate } from './util/moderation.js';
import { audit } from './util/audit.js';
import { maxRole } from './util/roles.js';
import { getSupabase } from './db/supabase.js';

const app = Fastify({ logger: true });

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET must be configured');
}

const adminBootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;
if (!adminBootstrapToken) {
  throw new Error('ADMIN_BOOTSTRAP_TOKEN must be configured');
}

const adminApiKey = process.env.ADMIN_API_KEY;
if (!adminApiKey) {
  throw new Error('ADMIN_API_KEY must be configured');
}

function parseRateLimitEnv(key: string, fallback: number) {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const inviteRateLimit = parseRateLimitEnv('INVITE_RATE_LIMIT_PER_IP', 10);
const verifyRateLimit = parseRateLimitEnv('VERIFY_RATE_LIMIT_PER_IP', 20);
const adminRateLimitConfig = {
  max: 30,
  timeWindow: '1 minute',
  hook: 'onRequest' as const,
  keyGenerator: (req: any) => {
    const header = req.headers?.['x-admin-api-key'];
    const headerValue = Array.isArray(header) ? header[0] : header;
    const cookieId = req.cookies?.[sessionCookieName] ?? 'no-session';
    return `${req.ip}:${cookieId}:${headerValue ?? 'no-key'}`;
  }
};

await app.register(cookie, {
  secret: sessionSecret,
  hook: 'onRequest'
});

app.addHook('onRequest', async (req) => {
  const user = await getUserFromRequest(req);
  req.log.info(
    {
      id: req.id,
      path: req.url,
      method: req.method,
      userId: user?.id ?? null,
      role: user?.role ?? 'anonymous'
    },
    'incoming'
  );
});

const defaultCorsOrigins = ['http://localhost:19006', 'http://localhost:3000'];
const allowedCorsOrigins = (process.env.CORS_ORIGINS || defaultCorsOrigins.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = allowedCorsOrigins.includes(origin);
    cb(null, allowed);
  },
  credentials: true
});
await app.register(rateLimit, {
  global: false,
  hook: 'onRequest',
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true
  },
  onExceeded: async (req, key) => {
    req.log.warn({ key, path: req.url, method: req.method }, 'Rate limit exceeded');
  }
});
await app.register(formbody);
await app.register(swagger, { openapi:{ info:{ title:'SkolApp API', version:'0.4.1'}, servers:[{url:'http://localhost:'+ (process.env.PORT||3333)}] } });
await app.register(swaggerUi, { routePrefix: '/docs' });

// Capabilities
const bankidEnabled = (process.env.BANKID_ENABLED||'false').toLowerCase()==='true';
app.get('/auth/capabilities', async () => ({ bankid: bankidEnabled, magic: true }));

// Seed default class + start reminders
await ensureDefaultClass();
startReminderWorkerSupabase();

// Health
app.get('/health', async () => ({ status: 'ok' }));

// AUTH magic-link
const emailProvider = getEmailProvider();
const pilotReturnToken = (process.env.PILOT_RETURN_TOKEN || 'false').toLowerCase() === 'true';

app.post(
  '/auth/magic/initiate',
  {
    config: {
      rateLimit: {
        max: inviteRateLimit,
        timeWindow: '10 minutes',
        hook: 'onRequest'
      }
    }
  },
  async (req, reply) => {
  const schema = z.object({ email: z.string().email(), classCode: z.string().min(1) });
  const { email, classCode } = schema.parse(req.body);
  const klass = await getClassByCode(classCode);
  if (!klass) return reply.code(404).send({ error: 'Klasskod hittades inte' });
  const res = await EmailMagicAuth.initiateLogin({ email, classCode });
  await createInvitation(email, classCode, res.token, 'guardian');
  req.log.info({ email, classCode }, 'Magic login initiated');
  const response: { ok: true; token?: string } = { ok: true };
  if (pilotReturnToken) {
    response.token = res.token;
  }
  return response;
}
);

app.post(
  '/auth/magic/verify',
  {
    config: {
      rateLimit: {
        max: verifyRateLimit,
        timeWindow: '10 minutes',
        hook: 'onRequest'
      }
    }
  },
  async (req, reply) => {
  const schema = z.object({ token: z.string().min(10) });
  const { token } = schema.parse(req.body);
  const inv = await getInvitationByToken(token);
  if (!inv) return reply.code(400).send({ error: 'Ogiltig token' });
  if (inv.used_at) {
    return reply.code(400).send({ error: 'Token har redan använts' });
  }
  const now = Date.now();
  const createdAt = inv.created_at ? new Date(inv.created_at).getTime() : now;
  const expiresAt = inv.expires_at ? new Date(inv.expires_at).getTime() : createdAt + 15 * 60 * 1000;
  if (Number.isFinite(expiresAt) && now > expiresAt) {
    return reply.code(400).send({ error: 'Token har gått ut' });
  }
  await markInvitationUsed(token);
  const before = await getUserByEmail(inv.email);
  const invitationRole = (inv.role as Role) ?? 'guardian';
  const user = await upsertUserByEmail(inv.email, invitationRole);
  await createSession(reply, user.id);
  const upgraded = before ? before.role !== user.role : invitationRole === user.role;
  await audit(
    'verify_magic',
    {
      email: inv.email,
      classCode: inv.class_code,
      invitationId: inv.id,
      role: user.role,
      from: before?.role ?? 'none',
      role_upgrade: upgraded
    },
    user.id,
    user.id
  );
  return { user: { id: user.id, email: user.email, role: user.role } };
}
);

app.get('/admin/status', async (_req, reply) => {
  const sb = getSupabase();
  const { count, error } = await sb
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  if (error) {
    reply.log.error({ err: error }, 'Failed to load admin status');
    return reply.code(500).send({ error: 'status_failed' });
  }
  const total = count ?? 0;
  return { hasAdmin: total > 0, count: total };
});

app.post(
  '/admin/bootstrap',
  {
    config: {
      rateLimit: adminRateLimitConfig
    }
  },
  async (req, reply) => {
    if (await hasAdminUser()) {
      return reply.code(409).send({ error: 'Admin finns redan' });
    }
    const headerSecretRaw = req.headers['x-bootstrap-token'];
    const headerSecret = Array.isArray(headerSecretRaw) ? headerSecretRaw[0] : headerSecretRaw;
    const schema = z.object({ email: z.string().email(), secret: z.string().min(1).optional() });
    const { email, secret } = schema.parse(req.body ?? {});
    const providedSecret = secret ?? headerSecret;
    if (providedSecret !== adminBootstrapToken) {
      req.log.warn({ email }, 'Invalid admin bootstrap secret');
      return reply.code(403).send({ error: 'Forbidden' });
    }
    const user = await upsertUserByEmail(email, 'admin');
    await createSession(reply, user.id);
    await audit('admin_bootstrap', { email }, user.id, user.id);
    return { ok: true, user: { id: user.id, email: user.email, role: user.role } };
  }
);

app.post(
  '/admin/promote',
  {
    config: {
      rateLimit: adminRateLimitConfig
    }
  },
  async (req, reply) => {
    const headerKeyRaw = req.headers['x-admin-api-key'];
    const headerKey = Array.isArray(headerKeyRaw) ? headerKeyRaw[0] : headerKeyRaw;
    let actorUserId: string | null = null;
    let via: 'session' | 'api_key' = 'session';
    if (headerKey && headerKey === adminApiKey) {
      via = 'api_key';
    } else {
      if (!(await requireRole(req, reply, ['admin']))) return;
      const actor = await getUserFromRequest(req);
      actorUserId = actor?.id ?? null;
    }
    const schema = z.object({ email: z.string().email(), role: z.enum(['guardian', 'teacher', 'admin']) });
    const { email, role } = schema.parse(req.body);
    const requestedRole = role as Role;
    const existing = await getUserByEmail(email);
    let user;
    let from: Role | 'none' = 'none';
    if (!existing) {
      user = await upsertUserByEmail(email, requestedRole);
    } else {
      from = existing.role as Role;
      const desiredRole = maxRole(existing.role as Role, requestedRole);
      user =
        desiredRole !== existing.role
          ? await updateUserRole(existing.id, desiredRole)
          : existing;
    }
    await audit(
      'promote_user',
      {
        email,
        requested: requestedRole,
        from,
        to: user.role,
        via
      },
      actorUserId,
      user.id
    );
    return { user: { id: user.id, email: user.email, role: user.role } };
  }
);

app.get('/auth/whoami', async (req, reply) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return reply.code(401).send({ error: 'Unauthenticated' });
  }
  return { user: { id: user.id, email: user.email, role: user.role } };
});

app.post('/auth/logout', async (req, reply) => {
  await destroySession(req, reply);
  return { ok: true };
});

// Admin: invites (admin only)
app.post(
  '/admin/invitations',
  {
    config: {
      rateLimit: adminRateLimitConfig
    }
  },
  async (req, reply) => {
    if (!(await requireRole(req, reply, ['admin']))) return;
    const schema = z.object({ csvText: z.string().min(1) });
    const { csvText } = schema.parse(req.body);
    const lines = csvText.trim().split(/\r?\n/);
    const header = lines.shift() || '';
    const cols = header.split(',').map(s => s.trim().toLowerCase());
    const emailIdx = cols.indexOf('email');
    const classIdx = cols.indexOf('classcode');
    const roleIdx = cols.indexOf('role');
    if (emailIdx < 0 || classIdx < 0) return reply.code(400).send({ error: 'CSV måste ha kolumner: email,classCode[,role]' });
    let count = 0;
    const allowedRoles: Role[] = ['guardian', 'teacher', 'admin'];
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 2) continue;
      const email = parts[emailIdx];
      const classCode = parts[classIdx];
      const requestedRole = roleIdx >= 0 ? (parts[roleIdx]?.toLowerCase() || 'guardian') : 'guardian';
      if (!allowedRoles.includes(requestedRole as Role)) {
        return reply.code(400).send({ error: `Ogiltig roll: ${parts[roleIdx] || ''}` });
      }
      const role = requestedRole as Role;
      const res = await EmailMagicAuth.initiateLogin({ email, classCode });
      const appLink = `skolapp://login?token=${res.token}`;
      const webLink = `https://app.skolapp.dev/login?token=${res.token}`;
      await createInvitation(email, classCode, res.token, role);
      await emailProvider.sendInvite(
        email,
        'Din inbjudan till SkolApp',
        `Hej!\n\nKlicka för att logga in: ${webLink}\n(Om du har appen installerad kan denna länk öppna appen direkt: ${appLink})\n\nHälsningar, SkolApp`,
        `<p>Hej!</p><p>Klicka för att logga in: <a href="${webLink}">${webLink}</a></p><p>App-länk: <a href="${appLink}">${appLink}</a></p><p>/SkolApp</p>`
      );
      count++;
    }
    return { ok: true, count };
  }
);

// Admin: test push/email (admin only)
app.post(
  '/admin/test-push',
  {
    config: {
      rateLimit: adminRateLimitConfig
    }
  },
  async (req, reply) => {
    if (!(await requireRole(req, reply, ['admin']))) return;
    const schema = z.object({ classId: z.string(), title: z.string(), body: z.string() });
    const { classId, title, body } = schema.parse(req.body);
    const tokens = await getClassTokens(classId);
    return await sendPush(tokens, title, body);
  }
);

app.post(
  '/admin/test-email',
  {
    config: {
      rateLimit: adminRateLimitConfig
    }
  },
  async (req, reply) => {
    if (!(await requireRole(req, reply, ['admin']))) return;
    try {
      await emailProvider.sendInvite('you@example.com','Test från SkolApp','Hej från SkolApp – SMTP funkar!');
      return { ok:true };
    } catch (e:any) {
      req.log.error(e);
      return reply.code(500).send({ ok:false, error:e.message });
    }
  }
);

// Devices & Push
app.post('/devices/register', async (req) => {
  const schema = z.object({ expoPushToken: z.string().min(10), classId: z.string() });
  const { expoPushToken, classId } = schema.parse(req.body);
  await registerDevice(classId, expoPushToken);
  return { ok: true };
});

// Events (teacher/admin create/delete)
app.get('/classes/:id/events', async (req) => {
  const { id } = (req.params as any);
  return await listEvents(id);
});
app.post('/events', async (req, reply) => {
  if (!(await requireRole(req, reply, ['teacher', 'admin']))) return;
  const schema = z.object({ classId: z.string(), type: z.string(), title: z.string(), description: z.string().optional(), start: z.string(), end: z.string() });
  const body = schema.parse(req.body);
  const evt = await createEvent(body);
  const tokens = await getClassTokens(body.classId);
  await sendPush(tokens, `Ny ${body.type.toLowerCase()} i klassen`, `${body.title} – ${new Date(body.start).toLocaleString()}`);
  return evt;
});
app.delete('/events/:id', async (req, reply) => {
  if (!(await requireRole(req, reply, ['teacher', 'admin']))) return;
  const { id } = (req.params as any);
  return await deleteEvent(id);
});

// Messages
app.get('/classes/:id/messages', async (req) => {
  const { id } = (req.params as any);
  return await listMessages(id);
});
app.post('/messages', async (req) => {
  const schema = z.object({ classId: z.string(), text: z.string().min(1) });
  const body = schema.parse(req.body);
  const mod = moderate(body.text);
  const msg = await postMessage({ classId: body.classId, senderId:'g1', senderName:'Anna Andersson', text: body.text, flagged: !!mod.flagged });
  return msg;
});

// BankID (stub)
app.post('/auth/bankid/initiate', async (req, reply) => {
  if (!bankidEnabled) return reply.code(501).send({ error: 'BankID inte aktiverat (BANKID_ENABLED=false)' });
  const schema = z.object({ personalNumber: z.string().optional(), device: z.enum(['mobile','desktop']).default('mobile') });
  const body = schema.parse(req.body || {});
  return await BankIdAuth.initiateLogin({ personalNumber: body.personalNumber, device: body.device });
});
app.post('/auth/bankid/collect', async (req, reply) => {
  if (!bankidEnabled) return reply.code(501).send({ error: 'BankID inte aktiverat (BANKID_ENABLED=false)' });
  const schema = z.object({ orderRef: z.string().min(3) }); const { orderRef } = schema.parse(req.body || {});
  return await BankIdAuth.verifyCallback({ orderRef });
});

// Reminders health
app.get('/reminders/health', async () => getRemindersHealth());

const port = Number(process.env.PORT || 3333);
if (process.env.NODE_ENV !== 'test') {
  app.listen({ port, host: '0.0.0.0' }).then(()=>console.log(`API http://localhost:${port} (docs /docs)`));
}

export { app };