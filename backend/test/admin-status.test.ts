import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, closeTestApp } from './helpers/app.js';

vi.mock('../src/db/supabase.js', () => {
  type Row = Record<string, any>;
  const state = {
    users: new Map<string, Row>(),
    sessions: new Map<string, Row>(),
    classes: new Map<string, Row>(),
    auditLogs: [] as Row[]
  };

  function selectBy(store: Map<string, Row>, column: string, value: any) {
    return Array.from(store.values()).filter((row) => row[column] === value);
  }

  function createUsersQuery() {
    return {
      select(_columns: string, options?: { count?: string; head?: boolean }) {
        return {
          eq(column: string, value: any) {
            const matches = selectBy(state.users, column, value);
            if (options?.head) {
              return Promise.resolve({ count: matches.length, error: null });
            }
            return {
              maybeSingle: async () => ({ data: matches[0] ?? null, error: null }),
              single: async () => ({ data: matches[0] ?? null, error: null })
            };
          }
        };
      },
      insert(row: Row) {
        state.users.set(row.id, { ...row });
        return {
          select() {
            return {
              single: async () => ({ data: state.users.get(row.id) ?? null, error: null })
            };
          }
        };
      },
      update(values: Row) {
        return {
          eq(column: string, value: any) {
            const matches = selectBy(state.users, column, value);
            const target = matches[0] ?? null;
            if (target) {
              Object.assign(target, values);
            }
            return {
              select() {
                return {
                  single: async () => ({ data: target, error: null })
                };
              }
            };
          }
        };
      },
      eq(column: string, value: any) {
        const matches = selectBy(state.users, column, value);
        return {
          maybeSingle: async () => ({ data: matches[0] ?? null, error: null })
        };
      }
    };
  }

  function createSessionsQuery() {
    return {
      insert(row: Row) {
        state.sessions.set(row.id, { ...row });
        return Promise.resolve({ data: row, error: null });
      },
      select() {
        return {
          eq(column: string, value: any) {
            const matches = selectBy(state.sessions, column, value);
            return {
              maybeSingle: async () => ({ data: matches[0] ?? null, error: null })
            };
          }
        };
      },
      update(values: Row) {
        return {
          eq(column: string, value: any) {
            const matches = selectBy(state.sessions, column, value);
            const target = matches[0] ?? null;
            if (target) {
              Object.assign(target, values);
            }
            return Promise.resolve({ data: target, error: null });
          }
        };
      }
    };
  }

  function createClassesQuery() {
    return {
      upsert(row: Row) {
        state.classes.set(row.id, { ...row });
        return Promise.resolve({ data: row, error: null });
      },
      select() {
        return {
          eq(column: string, value: any) {
            const matches = selectBy(state.classes, column, value);
            return {
              maybeSingle: async () => ({ data: matches[0] ?? null, error: null })
            };
          }
        };
      }
    };
  }

  function createAuditLogsQuery() {
    return {
      insert(row: Row) {
        state.auditLogs.push({ ...row });
        return Promise.resolve({ data: row, error: null });
      }
    };
  }

  const client = {
    from(table: string) {
      switch (table) {
        case 'users':
          return createUsersQuery();
        case 'sessions':
          return createSessionsQuery();
        case 'classes':
          return createClassesQuery();
        case 'audit_logs':
          return createAuditLogsQuery();
        default:
          throw new Error(`Unhandled table ${table}`);
      }
    }
  };

  return {
    getSupabase: () => client,
    __resetSupabase: () => {
      state.users.clear();
      state.sessions.clear();
      state.classes.clear();
      state.auditLogs = [];
    }
  };
});

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
