import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, closeTestApp } from './helpers/app.js';
import { buildSupabaseMock } from './helpers/supabaseMock.js';

vi.mock('../src/db/supabase.js', () => buildSupabaseMock());

const supabaseModule = await import('../src/db/supabase.js');
const { __resetSupabase } = supabaseModule as unknown as {
  __resetSupabase: () => void;
};

const { ensureDefaultClass } = await import('../src/repos/classesRepo.js');

function extractMetric(metrics: string, name: string): number {
  const regex = new RegExp(`^${name}(?:\\{[^}]*\\})?\\s+(\\d+(?:\\.\\d+)?)`, 'm');
  const match = metrics.match(regex);
  return match ? Number(match[1]) : 0;
}

describe('observability features', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    __resetSupabase();
    app = await createTestApp();
  });

  beforeEach(async () => {
    __resetSupabase();
    await ensureDefaultClass();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  async function getMetrics() {
    const response = await app.inject({ method: 'GET', url: '/metrics' });
    expect(response.statusCode).toBe(200);
    return response.body;
  }

  it('exposes Prometheus metrics with HTTP histogram', async () => {
    const metrics = await getMetrics();
    expect(metrics).toContain('http_request_duration_seconds');
  });

  it('increments counters for magic initiate and RBAC forbids', async () => {
    const before = await getMetrics();
    const initiateBefore = extractMetric(before, 'auth_magic_initiate_total');
    const rbacBefore = extractMetric(before, 'rbac_forbidden_total');

    const initiate = await app.inject({
      method: 'POST',
      url: '/auth/magic/initiate',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'metrics@example.com', classCode: '3A' }
    });
    expect(initiate.statusCode).toBe(200);

    await app.inject({ method: 'GET', url: '/admin/audit' });

    const after = await getMetrics();
    const initiateAfter = extractMetric(after, 'auth_magic_initiate_total');
    const rbacAfter = extractMetric(after, 'rbac_forbidden_total');

    expect(initiateAfter).toBe(initiateBefore + 1);
    expect(rbacAfter).toBe(rbacBefore + 1);
  });

  it('redacts authorization headers and tokens from logs', async () => {
    const writes: string[] = [];
    const originalWrite = process.stdout.write;
    (process.stdout.write as unknown as (chunk: any) => boolean) = (chunk: any) => {
      writes.push(chunk.toString());
      return true;
    };
    try {
      await app.inject({
        method: 'POST',
        url: '/auth/magic/initiate',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer SUPER-SECRET'
        },
        payload: { email: 'redact@example.com', classCode: '3A' }
      });
    } finally {
      process.stdout.write = originalWrite;
    }
    const output = writes.join('');
    expect(output).not.toContain('SUPER-SECRET');
  });

  it('protects metrics summary and audit endpoints behind admin role', async () => {
    const token = process.env.ADMIN_BOOTSTRAP_TOKEN ?? 'test-bootstrap-secret';
    const bootstrap = await app.inject({
      method: 'POST',
      url: '/admin/bootstrap',
      headers: {
        'content-type': 'application/json',
        'x-bootstrap-token': token
      },
      payload: { email: 'admin@test.dev', secret: token }
    });
    expect(bootstrap.statusCode).toBe(200);
    const cookie = bootstrap.headers['set-cookie'];
    expect(cookie).toBeDefined();

    const metricsSummary = await app.inject({
      method: 'GET',
      url: '/metrics/summary',
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : (cookie as string) }
    });
    expect(metricsSummary.statusCode).toBe(200);
    const summary = metricsSummary.json();
    expect(summary).toHaveProperty('requestsPerMinute');
    expect(summary).toHaveProperty('latencyMs');
    expect(summary.latencyMs).toHaveProperty('p50');
    expect(summary.latencyMs).toHaveProperty('p95');

    const audit = await app.inject({
      method: 'GET',
      url: '/admin/audit',
      headers: { cookie: Array.isArray(cookie) ? cookie[0] : (cookie as string) }
    });
    expect(audit.statusCode).toBe(200);
    const auditBody = audit.json();
    expect(auditBody).toHaveProperty('items');
    expect(auditBody).toHaveProperty('total');
  });

  it('exposes reminders health information', async () => {
    const res = await app.inject({ method: 'GET', url: '/reminders/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('lastRunAt');
    expect(body).toHaveProperty('lastSuccessAt');
    expect(body).toHaveProperty('lastError');
    expect(body).toHaveProperty('sent24h');
  });
});
