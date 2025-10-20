import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closeTestApp, createTestApp } from '../test/helpers/app';

const BASE_TIME = new Date('2025-01-01T12:00:00Z');

interface Invitation {
  id: string;
  email: string;
  class_code: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
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
  role: 'guardian' | 'teacher' | 'admin';
}

const mockEnsureDefaultClass = vi.fn(async () => ({ id: 'class-1', name: 'Klass 3A', code: '3A' }));
const mockGetClassByCode = vi.fn(async (code: string) => (code === '3A' ? { id: 'class-1', name: 'Klass 3A', code: '3A' } : null));

const invitations: Invitation[] = [];
const sessions: SessionRow[] = [];
const users = new Map<string, UserRow>();

const mockCreateInvitation = vi.fn(async (email: string, classCode: string, token: string) => {
  const row: Invitation = {
    id: `inv-${token}`,
    email,
    class_code: classCode,
    token,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    used_at: null
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

const mockUpsertUserByEmail = vi.fn(async (email: string, role: UserRow['role'] = 'guardian') => {
  if (users.has(email)) {
    return users.get(email)!;
  }
  const user: UserRow = {
    id: `user-${Buffer.from(email).toString('hex').slice(0, 8)}`,
    email,
    role
  };
  users.set(email, user);
  return user;
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
  upsertUserByEmail: mockUpsertUserByEmail
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
  mockCreateInvitation.mockClear();
  mockGetInvitationByToken.mockClear();
  mockMarkInvitationUsed.mockClear();
  mockGetClassByCode.mockClear();
  mockUpsertUserByEmail.mockClear();
  mockGetClassTokens.mockClear();
  mockSendPush.mockClear();
});

function extractSid(setCookie: string | string[] | undefined) {
  if (!setCookie) return null;
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const match = header.match(/sid=([^;]+)/);
  return match ? match[1] : null;
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

describe('server-side RBAC sessions', () => {
  async function loginAs(email: string, role: UserRow['role'] = 'guardian') {
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
    return { sid: sid!, user };
  }

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

    const blocked = await app.inject({
      method: 'POST',
      url: '/admin/test-email',
      headers: { cookie: `sid=${sid}` },
      payload: { }
    });
    expect(blocked.statusCode).toBe(403);
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
