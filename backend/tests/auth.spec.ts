import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closeTestApp, createTestApp } from '../test/helpers/app';
import { maxRole, roleRank, type Role } from '../src/util/roles.js';

const BASE_TIME = new Date('2025-01-01T12:00:00Z');

process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_BOOTSTRAP_TOKEN = 'bootstrap-secret';
process.env.ADMIN_API_KEY = 'admin-api-key';
process.env.INVITE_RATE_LIMIT_PER_IP = '30';
process.env.VERIFY_RATE_LIMIT_PER_IP = '40';

interface Invitation {
  id: string;
  email: string;
  class_code: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  role: Role;
}

interface SessionRow {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  revoked: boolean;
  ip?: string;
  user_agent?: string;
}

interface UserRow {
  id: string;
  email: string;
  role: Role;
}

interface AuditLog {
  action: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  meta: Record<string, unknown> | null;
}

const mockEnsureDefaultClass = vi.fn(async () => ({ id: 'class-1', name: 'Klass 3A', code: '3A' }));
const mockGetClassByCode = vi.fn(async (code: string) => (code === '3A' ? { id: 'class-1', name: 'Klass 3A', code: '3A' } : null));

const invitations: Invitation[] = [];
const sessions: SessionRow[] = [];
const users = new Map<string, UserRow>();
const auditLogs: AuditLog[] = [];

const mockCreateInvitation = vi.fn(async (email: string, classCode: string, token: string, role: Role = 'guardian') => {
  const row: Invitation = {
    id: `inv-${token}`,
    email,
    class_code: classCode,
    token,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    used_at: null,
    role
  };
  invitations.push(row);
  return row;
});
const mockGetInvitationByToken = vi.fn(async (token: string) => invitations.find((inv) => inv.token === token) ?? null);
const mockMarkInvitationUsed = vi.fn(async (token: string) => {
  const inv = invitations.find((row) => row.token === token);
  if (inv && !inv.used_at) {
    inv.used_at = new Date().toISOString();
  }
});

const mockUpsertUserByEmail = vi.fn(async (email: string, role: Role = 'guardian') => {
  const existing = users.get(email);
  if (existing) {
    const nextRole = maxRole(existing.role, role);
    if (roleRank[nextRole] > roleRank[existing.role]) {
      const updated = { ...existing, role: nextRole };
      users.set(email, updated);
      return updated;
    }
    return existing;
  }
  const user: UserRow = {
    id: `user-${Buffer.from(email).toString('hex').slice(0, 8)}`,
    email,
    role
  };
  users.set(email, user);
  return user;
});

const mockGetUserByEmail = vi.fn(async (email: string) => users.get(email) ?? null);
const mockHasAnyAdmin = vi.fn(async () => Array.from(users.values()).some((user) => user.role === 'admin'));
const mockUpdateUserRole = vi.fn(async (userId: string, role: Role) => {
  for (const [email, user] of users.entries()) {
    if (user.id === userId) {
      const updated = { ...user, role };
      users.set(email, updated);
      return updated;
    }
  }
  throw new Error('User not found');
});

const mockAudit = vi.fn(async (action: string, meta: any, actorUserId?: string, targetUserId?: string) => {
  auditLogs.push({ action, meta, actor_user_id: actorUserId ?? null, target_user_id: targetUserId ?? null });
});

vi.mock('../src/repos/classesRepo.js', () => ({
  ensureDefaultClass: mockEnsureDefaultClass,
  getClassByCode: mockGetClassByCode
}));
vi.mock('../src/repos/invitationsRepo.js', () => ({
  createInvitation: mockCreateInvitation,
  getInvitationByToken: mockGetInvitationByToken,
  markInvitationUsed: mockMarkInvitationUsed
}));
vi.mock('../src/repos/usersRepo.js', () => ({
  upsertUserByEmail: mockUpsertUserByEmail,
  getUserByEmail: mockGetUserByEmail,
  hasAnyAdmin: mockHasAnyAdmin,
  updateUserRole: mockUpdateUserRole
}));
const mockGetClassTokens = vi.fn(async () => ['expo-token']);
vi.mock('../src/repos/devicesRepo.js', () => ({
  registerDevice: vi.fn(),
  getClassTokens: mockGetClassTokens
}));
const mockSendPush = vi.fn(async () => ({ delivered: 1 }));
vi.mock('../src/services/PushService.js', () => ({
  sendPush: mockSendPush
}));
vi.mock('../src/util/remindersSupabase.js', () => ({
  startReminderWorkerSupabase: vi.fn(),
  getRemindersHealth: vi.fn(() => ({ at: 0, checked: 0, sent: 0 }))
}));
vi.mock('../src/util/audit.js', () => ({
  audit: mockAudit
}));
vi.mock('../src/db/supabase.js', () => ({
  getSupabase: () => ({
    from(table: string) {
      if (table === 'sessions') {
        return {
          async insert(payload: Partial<SessionRow>) {
            const row: SessionRow = {
              id: payload.id as string,
              user_id: payload.user_id as string,
              created_at: new Date().toISOString(),
              expires_at: payload.expires_at as string,
              revoked: payload.revoked ?? false,
              ip: payload.ip,
              user_agent: payload.user_agent
            };
            sessions.push(row);
            return { data: [row], error: null };
          },
          update(values: Partial<SessionRow>) {
            return {
              eq(column: keyof SessionRow, value: string) {
                const updated = sessions.filter((row) => (row as any)[column] === value);
                for (const row of updated) {
                  Object.assign(row, values);
                }
                return { data: updated, error: null };
              }
            };
          },
          select() {
            return {
              eq(column: keyof SessionRow, value: string) {
                const row = sessions.find((item) => (item as any)[column] === value) ?? null;
                return {
                  async maybeSingle() {
                    return { data: row, error: null };
                  }
                };
              }
            };
          }
        };
      }
      if (table === 'users') {
        return {
          select() {
            return {
              eq(column: keyof UserRow, value: string) {
                const row = Array.from(users.values()).find((user) => (user as any)[column] === value) ?? null;
                return {
                  async maybeSingle() {
                    return { data: row, error: null };
                  }
                };
              }
            };
          }
        };
      }
      throw new Error(`Unsupported table ${table}`);
    }
  })
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(() => {
  vi.setSystemTime(BASE_TIME);
  invitations.length = 0;
  sessions.length = 0;
  users.clear();
  auditLogs.length = 0;
  mockCreateInvitation.mockClear();
  mockGetInvitationByToken.mockClear();
  mockMarkInvitationUsed.mockClear();
  mockGetClassByCode.mockClear();
  mockUpsertUserByEmail.mockClear();
  mockGetUserByEmail.mockClear();
  mockHasAnyAdmin.mockClear();
  mockUpdateUserRole.mockClear();
  mockGetClassTokens.mockClear();
  mockSendPush.mockClear();
  mockAudit.mockClear();
});

function extractSid(setCookie: string | string[] | undefined) {
  if (!setCookie) return null;
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = header.match(/sid=([^;]+)/);
  return match ? match[1] : null;
}

async function loginAs(email: string, role: Role = 'guardian') {
  await app.inject({
    method: 'POST',
    url: '/auth/magic/initiate',
    payload: { email, classCode: '3A' }
  });
  const token = invitations.find((inv) => inv.email === email)!.token;
  const verifyResponse = await app.inject({
    method: 'POST',
    url: '/auth/magic/verify',
    payload: { token }
  });
  const sid = extractSid(verifyResponse.headers['set-cookie']);
  const user = users.get(email)!;
  user.role = role;
  users.set(email, user);
  return { sid: sid!, user };
}

describe('magic link flow', () => {
  test('returns 404 when class code is missing', async () => {
    mockGetClassByCode.mockResolvedValueOnce(null);
    const response = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'missing@class.com', classCode: 'XYZ' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Klasskod hittades inte' });
  });

  test('verify issues cookie session and never returns token', async () => {
    const initiateResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'pilot@example.com', classCode: '3A' }
    });
    expect(initiateResponse.statusCode).toBe(200);
    expect(initiateResponse.json()).toEqual({ ok: true });
    expect(invitations).toHaveLength(1);

    const token = invitations[0]!.token;
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token }
    });

    expect(verifyResponse.statusCode).toBe(200);
    expect(verifyResponse.json()).toEqual({
      user: {
        id: users.get('pilot@example.com')!.id,
        email: 'pilot@example.com',
        role: 'guardian'
      }
    });
    const setCookie = verifyResponse.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    const sid = extractSid(setCookie);
    expect(sid).toBeTruthy();
    const header = Array.isArray(setCookie) ? setCookie[0]! : setCookie!;
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).not.toContain('sessionToken');
    expect(mockMarkInvitationUsed).toHaveBeenCalledWith(token);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: 'verify_magic',
      meta: expect.objectContaining({ role: 'guardian', role_upgrade: false })
    });
  });

  test('rejects expired tokens and prevents reuse', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'ttl@example.com', classCode: '3A' }
    });
    const token = invitations[0]!.token;

    vi.setSystemTime(new Date(BASE_TIME.getTime() + 16 * 60 * 1000));

    const expiredResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token }
    });
    expect(expiredResponse.statusCode).toBe(400);
    expect(expiredResponse.json()).toEqual({ error: 'Token har gått ut' });

    vi.setSystemTime(BASE_TIME);

    invitations[0]!.expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const freshResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token }
    });
    expect(freshResponse.statusCode).toBe(200);

    const reused = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token }
    });
    expect(reused.statusCode).toBe(400);
    expect(reused.json()).toEqual({ error: 'Token har redan använts' });
  });
});

describe('admin bootstrap and promotion', () => {
  test('bootstrap creates first admin when secret matches', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      payload: { email: 'rektorn@example.com', secret: 'bootstrap-secret' }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      user: { email: 'rektorn@example.com', role: 'admin' }
    });
    expect(extractSid(response.headers['set-cookie'])).toBeTruthy();
    expect(mockHasAnyAdmin).toHaveBeenCalled();
    expect(mockUpsertUserByEmail).toHaveBeenCalledWith('rektorn@example.com', 'admin');
    expect(auditLogs.at(-1)).toMatchObject({ action: 'admin_bootstrap' });
  });

  test('bootstrap returns 409 when admin already exists', async () => {
    users.set('existing-admin@example.com', {
      id: 'user-existing',
      email: 'existing-admin@example.com',
      role: 'admin'
    });
    const response = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      payload: { email: 'other@example.com', secret: 'bootstrap-secret' }
    });
    expect(response.statusCode).toBe(409);
    expect(auditLogs).toHaveLength(0);
  });

  test('promote upgrades role for admin session and logs audit entry', async () => {
    await mockUpsertUserByEmail('guardian@example.com', 'guardian');
    const { sid } = await loginAs('admin@example.com', 'admin');
    auditLogs.length = 0;

    const response = await app.inject({
      method: 'POST',
      url: '/admin/promote',
      payload: { email: 'guardian@example.com', role: 'teacher' },
      headers: { cookie: `sid=${sid}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      updated: true,
      user: { email: 'guardian@example.com', role: 'teacher' }
    });
    expect(mockUpdateUserRole).toHaveBeenCalledTimes(1);
    expect(users.get('guardian@example.com')!.role).toBe('teacher');
    expect(auditLogs.at(-1)).toMatchObject({
      action: 'promote_user',
      meta: expect.objectContaining({ from: 'guardian', to: 'teacher', via: 'session', by: 'admin@example.com' })
    });
  });

  test('promote never downgrades roles', async () => {
    await mockUpsertUserByEmail('teacher@example.com', 'teacher');
    const { sid } = await loginAs('admin2@example.com', 'admin');
    auditLogs.length = 0;

    const response = await app.inject({
      method: 'POST',
      url: '/admin/promote',
      payload: { email: 'teacher@example.com', role: 'guardian' },
      headers: { cookie: `sid=${sid}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      updated: false,
      user: { email: 'teacher@example.com', role: 'teacher' }
    });
    expect(mockUpdateUserRole).not.toHaveBeenCalled();
    expect(users.get('teacher@example.com')!.role).toBe('teacher');
    expect(auditLogs.at(-1)).toMatchObject({
      action: 'promote_user',
      meta: expect.objectContaining({ from: 'teacher', to: 'teacher', via: 'session' })
    });
  });

  test('promote via API key upgrades role', async () => {
    const user = await mockUpsertUserByEmail('staff@example.com', 'teacher');
    auditLogs.length = 0;

    const response = await app.inject({
      method: 'POST',
      url: '/admin/promote',
      payload: { email: 'staff@example.com', role: 'admin' },
      headers: { 'x-admin-api-key': 'admin-api-key' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      updated: true,
      user: { email: 'staff@example.com', role: 'admin' }
    });
    expect(mockUpdateUserRole).toHaveBeenCalledWith(user.id, 'admin');
    expect(auditLogs.at(-1)).toMatchObject({
      action: 'promote_user',
      meta: expect.objectContaining({ from: 'teacher', to: 'admin', via: 'api_key', by: 'api_key' })
    });
  });
});

describe('magic verify invitation roles', () => {
  test('upgrades user role when invitation specifies higher role', async () => {
    await mockUpsertUserByEmail('guardian-up@example.com', 'guardian');
    await mockCreateInvitation('guardian-up@example.com', '3A', 'teacher-token', 'teacher');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token: 'teacher-token' }
    });

    expect(response.statusCode).toBe(200);
    expect(users.get('guardian-up@example.com')!.role).toBe('teacher');
    expect(auditLogs.at(-1)).toMatchObject({
      action: 'verify_magic',
      meta: expect.objectContaining({ role: 'teacher', role_upgrade: true })
    });
  });

  test('does not downgrade admins when invitation role is lower', async () => {
    await mockUpsertUserByEmail('already-admin@example.com', 'admin');
    await mockCreateInvitation('already-admin@example.com', '3A', 'guardian-token', 'guardian');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token: 'guardian-token' }
    });

    expect(response.statusCode).toBe(200);
    expect(users.get('already-admin@example.com')!.role).toBe('admin');
    expect(auditLogs.at(-1)).toMatchObject({
      action: 'verify_magic',
      meta: expect.objectContaining({ role: 'guardian', role_upgrade: false })
    });
  });
});

describe('rate limits', () => {
  test('invite initiation is throttled per IP', async () => {
    const limit = Number(process.env.INVITE_RATE_LIMIT_PER_IP ?? '10');
    for (let i = 0; i < limit; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/magic/initiate',
        payload: { email: `spam${i}@example.com`, classCode: '3A' },
        remoteAddress: '200.0.0.1'
      });
      expect(res.statusCode).toBe(200);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'blocked@example.com', classCode: '3A' },
      remoteAddress: '200.0.0.1'
    });
    expect(blocked.statusCode).toBe(429);
  });
});

describe('CSV invitations', () => {
  test('stores role per invitation row', async () => {
    const { sid } = await loginAs('admin-csv@example.com', 'admin');
    auditLogs.length = 0;
    mockCreateInvitation.mockClear();

    const csv = [
      'email,classCode,role',
      'guardian@example.com,3A,guardian',
      'teacher@example.com,3A,teacher',
      'principal@example.com,3A,admin'
    ].join('\n');

    const response = await app.inject({
      method: 'POST',
      url: '/admin/invitations',
      payload: { csvText: csv },
      headers: { cookie: `sid=${sid}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, count: 3 });
    expect(mockCreateInvitation).toHaveBeenNthCalledWith(1, 'guardian@example.com', '3A', expect.any(String), 'guardian');
    expect(mockCreateInvitation).toHaveBeenNthCalledWith(2, 'teacher@example.com', '3A', expect.any(String), 'teacher');
    expect(mockCreateInvitation).toHaveBeenNthCalledWith(3, 'principal@example.com', '3A', expect.any(String), 'admin');
  });

  test('rejects invalid role values', async () => {
    const { sid } = await loginAs('admin-invalid@example.com', 'admin');
    mockCreateInvitation.mockClear();
    const csv = 'email,classCode,role\nuser@example.com,3A,principal';
    const response = await app.inject({
      method: 'POST',
      url: '/admin/invitations',
      payload: { csvText: csv },
      headers: { cookie: `sid=${sid}` }
    });

    expect(response.statusCode).toBe(400);
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });
});

describe('server-side RBAC sessions', () => {
  test('blocks admin endpoint without session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/invitations',
      payload: { csvText: 'email,classCode\nuser@example.com,3A' }
    });
    expect(response.statusCode).toBe(403);
  });

  test('allows admin endpoint when session has admin role', async () => {
    const { sid } = await loginAs('admin@example.com', 'admin');
    const response = await app.inject({
      method: 'POST',
      url: '/admin/test-push',
      payload: { classId: 'class-1', title: 'Hej', body: 'Världen' },
      headers: { cookie: `sid=${sid}` }
    });
    expect(response.statusCode).toBe(200);
  });

  test('whoami returns 401 when session is missing', async () => {
    const response = await app.inject({ method: 'GET', url: '/auth/whoami' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Unauthenticated' });
  });

  test('whoami returns current session user', async () => {
    const { sid, user } = await loginAs('guardian@example.com', 'guardian');
    const response = await app.inject({
      method: 'GET',
      url: '/auth/whoami',
      headers: { cookie: `sid=${sid}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  });

  test('logout revokes session cookie', async () => {
    const { sid } = await loginAs('logout@example.com', 'admin');
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: `sid=${sid}` }
    });
    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toEqual({ ok: true });
    expect(sessions.find((row) => row.id === sid)?.revoked).toBe(true);
    const clearCookie = logoutResponse.headers['set-cookie'];
    expect(clearCookie).toBeTruthy();
    const header = Array.isArray(clearCookie) ? clearCookie[0]! : clearCookie!;
    expect(header).toContain('sid=');
    expect(header).toContain('Path=/');

    const blocked = await app.inject({
      method: 'POST',
      url: '/admin/test-email',
      headers: { cookie: `sid=${sid}` },
      payload: { }
    });
    expect(blocked.statusCode).toBe(403);

    const whoamiAfter = await app.inject({
      method: 'GET',
      url: '/auth/whoami',
      headers: { cookie: `sid=${sid}` }
    });
    expect(whoamiAfter.statusCode).toBe(401);
  });

  test('session expires after TTL days', async () => {
    const { sid } = await loginAs('ttl-admin@example.com', 'admin');
    const ttlDays = Number(process.env.SESSION_TTL_DAYS ?? '30');
    vi.setSystemTime(new Date(BASE_TIME.getTime() + (ttlDays + 1) * 24 * 60 * 60 * 1000));

    const response = await app.inject({
      method: 'POST',
      url: '/admin/test-push',
      payload: { classId: 'class-1', title: 'Hej', body: 'Efter TTL' },
      headers: { cookie: `sid=${sid}` }
    });
    expect(response.statusCode).toBe(403);
  });
});
