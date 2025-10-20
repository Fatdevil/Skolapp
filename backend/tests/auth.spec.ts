import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

type Invitation = {
  id: string;
  email: string;
  class_code: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
};

process.env.NODE_ENV = 'test';
process.env.PILOT_RETURN_TOKEN = 'true';

const mockEnsureDefaultClass = vi.fn(async () => ({ id: 'class-1', name: 'Klass 3A', code: '3A' }));
const mockGetClassByCode = vi.fn(async (code: string) => (code === '3A' ? { id: 'class-1', name: 'Klass 3A', code: '3A' } : null));

const invitations: Invitation[] = [];
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
  if (inv) {
    inv.used_at = new Date().toISOString();
  }
});

const users = new Map<string, { id: string; email: string; role: 'guardian' | 'teacher' | 'admin' }>();
const mockUpsertUserByEmail = vi.fn(async (email: string) => {
  if (users.has(email)) {
    return users.get(email)!;
  }
  const user = { id: `user-${Buffer.from(email).toString('hex').slice(0, 8)}`, email, role: 'guardian' as const };
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
vi.mock('../src/util/remindersSupabase.js', () => ({
  startReminderWorkerSupabase: vi.fn(),
  getRemindersHealth: vi.fn(() => ({ at: 0, checked: 0, sent: 0 }))
}));

let app: FastifyInstance;

beforeAll(async () => {
  const mod = await import('../src/index.js');
  app = mod.app;
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  invitations.length = 0;
  mockCreateInvitation.mockClear();
  mockGetInvitationByToken.mockClear();
  mockMarkInvitationUsed.mockClear();
  mockGetClassByCode.mockClear();
  mockUpsertUserByEmail.mockClear();
  users.clear();
});

describe('magic link pilot flow', () => {
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

  test('initiate + verify stores token and returns session', async () => {
    const initiateResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'pilot@example.com', classCode: '3A' }
    });
    expect(initiateResponse.statusCode).toBe(200);
    const initiateBody = initiateResponse.json() as { ok: boolean; token?: string };
    expect(initiateBody.ok).toBe(true);
    expect(initiateBody.token).toBeDefined();
    expect(mockCreateInvitation).toHaveBeenCalledTimes(1);
    expect(invitations).toHaveLength(1);

    const token = initiateBody.token!;
    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token }
    });
    expect(verifyResponse.statusCode).toBe(200);
    expect(mockMarkInvitationUsed).toHaveBeenCalledWith(token);
    const verifyBody = verifyResponse.json() as any;
    expect(verifyBody).toMatchObject({
      sessionToken: 'dev-session',
      user: { email: 'pilot@example.com', role: 'guardian' }
    });
    expect(invitations[0].used_at).not.toBeNull();
  });

  test('rejects reused or expired tokens', async () => {
    const initiateResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      payload: { email: 'reuse@example.com', classCode: '3A' }
    });
    const token = (initiateResponse.json() as any).token as string;
    const invitation = invitations[0];
    invitation.expires_at = new Date(Date.now() - 60_000).toISOString();
    const expiredResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token }
    });
    expect(expiredResponse.statusCode).toBe(400);
    expect(expiredResponse.json()).toEqual({ error: 'Token har gått ut' });

    invitation.expires_at = new Date(Date.now() + 60_000).toISOString();
    invitation.used_at = null;
    const firstVerify = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token }
    });
    expect(firstVerify.statusCode).toBe(200);

    const reusedResponse = await app.inject({
      method: 'POST',
      url: '/auth/magic/verify',
      payload: { token }
    });
    expect(reusedResponse.statusCode).toBe(400);
    expect(reusedResponse.json()).toEqual({ error: 'Token har redan använts' });
  });
});

describe('RBAC hardening', () => {
  test('blocks admin endpoints for guardian', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/invitations',
      payload: { csvText: 'email,classCode\nuser@example.com,3A' }
    });
    expect(response.statusCode).toBe(403);
  });
});
