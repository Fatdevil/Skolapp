import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, closeTestApp } from './helpers/app.js';
import { buildSupabaseMock } from './helpers/supabaseMock.js';

vi.mock('../src/db/supabase.js', () => buildSupabaseMock());

const supabaseModule = await import('../src/db/supabase.js');

const { __resetSupabase } = supabaseModule as unknown as {
  __resetSupabase: () => void;
};

describe('admin status endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    __resetSupabase();
    app = await createTestApp();
  });

  beforeEach(() => {
    __resetSupabase();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('returns false when no admin exists', async () => {
    const response = await app.inject({ method: 'GET', url: '/admin/status' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hasAdmin: false, count: 0 });
  });

  it('reports true once an admin has been bootstrapped and blocks duplicates', async () => {
    const token = process.env.ADMIN_BOOTSTRAP_TOKEN ?? 'test-bootstrap-secret';
    const email = 'first.admin@example.com';

    const first = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-token': token
      },
      payload: { email, secret: token }
    });

    expect(first.statusCode).toBe(200);

    const statusResponse = await app.inject({ method: 'GET', url: '/admin/status' });
    const body = statusResponse.json();

    expect(statusResponse.statusCode).toBe(200);
    expect(body.hasAdmin).toBe(true);
    expect(body.count).toBeGreaterThanOrEqual(1);

    const second = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-token': token
      },
      payload: { email, secret: token }
    });

    expect(second.statusCode).toBe(409);
  });
});
