import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { closeTestApp, createTestApp } from '../test/helpers/app';

const BASE_TIME = new Date('2025-01-01T12:00:00Z');

type UserRole = 'guardian' | 'teacher' | 'admin';

interface Invitation {
  id: string;
  email: string;
  class_code: string;
  token: string;
  role: UserRole;
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
  role: UserRole;
}

interface AuditEntry {
  action: string;
  meta: Record<string, any> | null;
  actorUserId: string | null | undefined;
  targetUserId: string | null | undefined;
}

const mockEnsureDefaultClass = vi.fn(async () => ({ id: 'class-1', name: 'Klass 3A', code: '3A' }));
const mockGetClassByCode = vi.fn(async (code: string) => (code === '3A' ? { id: 'class-1', name: 'Klass 3A', code: '3A' } : null));

const invitations: Invitation[] = [];
const sessions: SessionRow[] = [];
const usersByEmail = new Map<string, UserRow>();
const usersById = new Map<string, UserRow>();
const auditEntries: AuditEntry[] = [];

const ROLE_RANK: Record<UserRole, number> = { guardian: 0, teacher: 1, admin: 2 };

const mockCreateInvitation = vi.fn(async (email: string, classCode: string, token: string, role: UserRole = 'guardian') => {
  const row: Invitation = {
    id: `inv-${token}`,
    email,
    class_code: classCode,
    token,
    role,
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

const mockUpsertUserByEmail = vi.fn(async (email: string, role: UserRole = 'guardian') => {
  const existing = usersByEmail.get(email);
  if (existing) {
    if (ROLE_RANK[role] > ROLE_RANK[existing.role]) {
      const updated: UserRow = { ...existing, role };
      usersByEmail.set(email, updated);
      usersById.set(updated.id, updated);
      return updated;
    }
    return existing;
  }
  const user: UserRow = {
    id: `user-${Buffer.from(email).toString('hex').slice(0, 8)}`,
    email,
    role
  };
  usersByEmail.set(email, user);
  usersById.set(user.id, user);
  return user;
});
const mockGetUserByEmail = vi.fn(async (email: string) => usersByEmail.get(email) ?? null);
const mockUpdateUserRole = vi.fn(async (userId: string, role: UserRole) => {
  const existing = usersById.get(userId);
  if (!existing) throw new Error('User not found');
  const updated: UserRow = { ...existing, role };
  usersById.set(userId, updated);
  usersByEmail.set(updated.email, updated);
  return updated;
});
const mockHasAdminUser = vi.fn(async () => Array.from(usersByEmail.values()).some((user) => user.role === 'admin'));
const mockAudit = vi.fn(async (action: string, meta: Record<string, any> | null, actorUserId?: string | null, targetUserId?: string | null) => {
  auditEntries.push({ action, meta, actorUserId, targetUserId });
});

const mockGetClassTokens = vi.fn(async () => ['expo-token']);
const mockSendPush = vi.fn(async () => ({ delivered: 1 }));

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
  updateUserRole: mockUpdateUserRole,
  hasAdminUser: mockHasAdminUser
}));
vi.mock('../src/util/audit.js', () => ({
  audit: mockAudit
}));
vi.mock('../src/repos/devicesRepo.js', () => ({
  registerDevice: vi.fn(),
  getClassTokens: mockGetClassTokens
}));
vi.mock('../src/services/PushService.js', () => ({
  sendPush: mockSendPush
}));
vi.mock('../src/util/remindersSupabase.js', () => ({
  startReminderWorkerSupabase: vi.fn(),
  getRemindersHealth: vi.fn(() => ({ at: 0, checked: 0, sent: 0 }))
}));
const classes = new Map<string, { id: string; name: string; code: string }>();

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
                const row = Array.from(usersById.values()).find((user) => (user as any)[column] === value) ?? null;
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
      if (table === 'classes') {
        return {
          async upsert(row: { id: string; name: string; code: string }) {
            classes.set(row.id, { ...row });
            return { data: row, error: null };
          },
          select() {
            return {
              eq(column: 'id' | 'code', value: string) {
                const match = Array.from(classes.values()).find((item) => (item as any)[column] === value) ?? null;
                return {
                  async maybeSingle() {
                    return { data: match, error: null };
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
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session';
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-key';
  process.env.ADMIN_BOOTSTRAP_TOKEN = 'boot-secret';
  process.env.ADMIN_API_KEY = 'api-secret';
  process.env.INVITE_RATE_LIMIT_PER_IP = '2';
  process.env.VERIFY_RATE_LIMIT_PER_IP = '2';
  app = await createTestApp();
});

afterAll(async () => {
  await closeTestApp();
});

beforeEach(() => {
  vi.setSystemTime(BASE_TIME);
  invitations.length = 0;
  sessions.length = 0;
  usersByEmail.clear();
  usersById.clear();
  auditEntries.length = 0;
  mockCreateInvitation.mockClear();
  mockGetInvitationByToken.mockClear();
  mockMarkInvitationUsed.mockClear();
  mockGetClassByCode.mockClear();
  mockUpsertUserByEmail.mockClear();
  mockGetUserByEmail.mockClear();
  mockUpdateUserRole.mockClear();
  mockHasAdminUser.mockClear();
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

describe('admin bootstrap', () => {
  test('creates first admin with valid secret and logs audit entry', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      payload: { email: 'rector@example.com', secret: 'boot-secret' }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.role).toBe('admin');
    const sid = extractSid(response.headers['set-cookie']);
    expect(sid).toBeTruthy();
    expect(mockAudit).toHaveBeenCalledWith('admin_bootstrap', { email: 'rector@example.com' }, expect.any(String), expect.any(String));
  });

  test('returns 409 when admin already exists', async () => {
    usersByEmail.set('admin@example.com', { id: 'user-admin', email: 'admin@example.com', role: 'admin' });
    usersById.set('user-admin', { id: 'user-admin', email: 'admin@example.com', role: 'admin' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      payload: { email: 'rector@example.com', secret: 'boot-secret' }
    });

    expect(response.statusCode).toBe(409);
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe('admin promote', () => {
  async function bootstrapAdmin() {
    const bootstrapResponse = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      payload: { email: 'admin@example.com', secret: 'boot-secret' }
    });
    const sid = extractSid(bootstrapResponse.headers['set-cookie']);
    return sid;
  }

  test('upgrades guardian to teacher via admin session', async () => {
    const sid = await bootstrapAdmin();
    usersByEmail.set('parent@example.com', { id: 'user-parent', email: 'parent@example.com', role: 'guardian' });
    usersById.set('user-parent', { id: 'user-parent', email: 'parent@example.com', role: 'guardian' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/promote',
      cookies: { sid: sid! },
      payload: { email: 'parent@example.com', role: 'teacher' }
    });

    expect(response.statusCode).toBe(200);
    const user = response.json().user;
    expect(user.role).toBe('teacher');
    expect(mockAudit).toHaveBeenCalledWith(
      'promote_user',
      expect.objectContaining({ from: 'guardian', to: 'teacher', via: 'session' }),
      expect.any(String),
      'user-parent'
    );
  });

  test('keeps highest role and records audit when downgrade requested', async () => {
    const sid = await bootstrapAdmin();
    usersByEmail.set('teacher@example.com', { id: 'user-teacher', email: 'teacher@example.com', role: 'admin' });
    usersById.set('user-teacher', { id: 'user-teacher', email: 'teacher@example.com', role: 'admin' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/promote',
      cookies: { sid: sid! },
      payload: { email: 'teacher@example.com', role: 'guardian' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe('admin');
    expect(mockUpdateUserRole).not.toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      'promote_user',
      expect.objectContaining({ from: 'admin', to: 'admin', via: 'session' }),
      expect.any(String),
      'user-teacher'
    );
  });

  test('allows API key to promote user', async () => {
    usersByEmail.set('guardian@example.com', { id: 'user-guard', email: 'guardian@example.com', role: 'guardian' });
    usersById.set('user-guard', { id: 'user-guard', email: 'guardian@example.com', role: 'guardian' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/promote',
      headers: { 'x-admin-api-key': 'api-secret' },
      payload: { email: 'guardian@example.com', role: 'admin' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe('admin');
    expect(mockAudit).toHaveBeenCalledWith(
      'promote_user',
      expect.objectContaining({ via: 'api_key', to: 'admin' }),
      null,
      'user-guard'
    );
  });
});

describe('magic verify role upgrades', () => {
  test('upgrades role from invitation when higher', async () => {
    usersByEmail.set('guardian@example.com', { id: 'user-guard', email: 'guardian@example.com', role: 'guardian' });
    usersById.set('user-guard', { id: 'user-guard', email: 'guardian@example.com', role: 'guardian' });
    invitations.push({
      id: 'inv-1',
      email: 'guardian@example.com',
      class_code: '3A',
      token: 'token-123456789',
      role: 'teacher',
      created_at: BASE_TIME.toISOString(),
      expires_at: null,
      used_at: null
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token: 'token-123456789' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe('teacher');
    expect(invitations[0].used_at).not.toBeNull();
    expect(mockAudit).toHaveBeenCalledWith(
      'verify_magic',
      expect.objectContaining({ role_upgrade: true, from: 'guardian' }),
      'user-guard',
      'user-guard'
    );
  });

  test('does not downgrade admin role', async () => {
    usersByEmail.set('admin@example.com', { id: 'user-admin', email: 'admin@example.com', role: 'admin' });
    usersById.set('user-admin', { id: 'user-admin', email: 'admin@example.com', role: 'admin' });
    invitations.push({
      id: 'inv-2',
      email: 'admin@example.com',
      class_code: '3A',
      token: 'token-456789012',
      role: 'guardian',
      created_at: BASE_TIME.toISOString(),
      expires_at: null,
      used_at: null
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token: 'token-456789012' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe('admin');
    expect(mockAudit).toHaveBeenCalledWith(
      'verify_magic',
      expect.objectContaining({ role_upgrade: false, from: 'admin' }),
      'user-admin',
      'user-admin'
    );
  });
});

describe('rate limits', () => {
  test('rate limits magic initiate per IP', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'first@example.com', classCode: '3A' }
    });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'second@example.com', classCode: '3A' }
    });
    expect(second.statusCode).toBe(200);
    const third = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'third@example.com', classCode: '3A' }
    });
    expect(third.statusCode).toBe(429);
  });
});

describe('CSV invitations with role', () => {
  async function bootstrapAdmin() {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      payload: { email: 'admin@example.com', secret: 'boot-secret' }
    });
    return extractSid(response.headers['set-cookie']);
  }

  test('creates invitations with provided roles', async () => {
    const sid = await bootstrapAdmin();
    const csv = 'email,classCode,role\nparent@example.com,3A,guardian\nteacher@example.com,3A,teacher\nadmin@example.com,3A,admin';

    const response = await app.inject({
      method: 'POST',
      url: '/admin/invitations',
      cookies: { sid: sid! },
      payload: { csvText: csv }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, count: 3 });
    expect(invitations.map((inv) => inv.role)).toEqual(['guardian', 'teacher', 'admin']);
  });

  test('rejects invitations with invalid role', async () => {
    const sid = await bootstrapAdmin();
    const csv = 'email,classCode,role\nparent@example.com,3A,guardian\nuser@example.com,3A,superhero';

    const response = await app.inject({
      method: 'POST',
      url: '/admin/invitations',
      cookies: { sid: sid! },
      payload: { csvText: csv }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain('Ogiltig roll');
  });
});
