import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;

type TableState = {
  users: Map<string, Row>;
  sessions: Map<string, Row>;
  classes: Map<string, Row>;
  auditLogs: Row[];
  invitations: Map<string, Row>;
  events: Row[];
  remindersSent: Map<string, Row>;
  devices: Row[];
};

function createInitialState(): TableState {
  return {
    users: new Map(),
    sessions: new Map(),
    classes: new Map(),
    auditLogs: [],
    invitations: new Map(),
    events: [],
    remindersSent: new Map(),
    devices: []
  };
}

function selectBy(store: Iterable<Row>, predicate: (row: Row) => boolean) {
  return Array.from(store).filter(predicate);
}

function createUsersQuery(state: TableState) {
  return {
    select(_columns: string, options?: { count?: string; head?: boolean }) {
      return {
        eq(column: string, value: any) {
          const matches = selectBy(state.users.values(), (row) => row[column] === value);
          if (options?.head) {
            return Promise.resolve({ count: matches.length, error: null });
          }
          return {
            maybeSingle: async () => ({ data: matches[0] ?? null, error: null }),
            single: async () => ({ data: matches[0] ?? null, error: null })
          };
        },
        ilike(column: string, pattern: string) {
          const term = pattern.replace(/%/g, '').toLowerCase();
          const matches = selectBy(state.users.values(), (row) =>
            String(row[column] ?? '').toLowerCase().includes(term)
          );
          return Promise.resolve({ data: matches, error: null });
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
          const matches = selectBy(state.users.values(), (row) => row[column] === value);
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
      const matches = selectBy(state.users.values(), (row) => row[column] === value);
      return {
        maybeSingle: async () => ({ data: matches[0] ?? null, error: null })
      };
    }
  };
}

function createSessionsQuery(state: TableState) {
  return {
    insert(row: Row) {
      state.sessions.set(row.id, { ...row });
      return Promise.resolve({ data: row, error: null });
    },
    select() {
      return {
        eq(column: string, value: any) {
          const matches = selectBy(state.sessions.values(), (row) => row[column] === value);
          return {
            maybeSingle: async () => ({ data: matches[0] ?? null, error: null })
          };
        }
      };
    },
    update(values: Row) {
      return {
        eq(column: string, value: any) {
          const matches = selectBy(state.sessions.values(), (row) => row[column] === value);
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

function createClassesQuery(state: TableState) {
  return {
    upsert(row: Row) {
      state.classes.set(row.id, { ...row });
      return Promise.resolve({ data: row, error: null });
    },
    select() {
      return {
        eq(column: string, value: any) {
          const matches = selectBy(state.classes.values(), (row) => row[column] === value);
          return {
            maybeSingle: async () => ({ data: matches[0] ?? null, error: null })
          };
        }
      };
    }
  };
}

function createInvitationsQuery(state: TableState) {
  return {
    insert(row: Row) {
      const id = row.id ?? randomUUID();
      state.invitations.set(id, { ...row, id });
      return {
        select() {
          return {
            single: async () => ({ data: state.invitations.get(id) ?? null, error: null })
          };
        }
      };
    },
    select() {
      return {
        eq(column: string, value: any) {
          const matches = selectBy(state.invitations.values(), (row) => row[column] === value);
          return {
            maybeSingle: async () => ({ data: matches[0] ?? null, error: null })
          };
        }
      };
    },
    update(values: Row) {
      return {
        eq(column: string, value: any) {
          const matches = selectBy(state.invitations.values(), (row) => row[column] === value);
          const target = matches[0] ?? null;
          if (target) {
            Object.assign(target, values);
          }
          return {
            is: () => ({ error: null })
          };
        }
      };
    }
  };
}

function createAuditLogsQuery(state: TableState) {
  return {
    insert(row: Row) {
      const enriched = {
        id: row.id ?? randomUUID(),
        created_at: row.created_at ?? new Date().toISOString(),
        ...row
      };
      state.auditLogs.push(enriched);
      return Promise.resolve({ data: enriched, error: null });
    },
    select(_columns: string, options?: { count?: string }) {
      let dataset = [...state.auditLogs];
      const builder = {
        eq(column: string, value: any) {
          dataset = dataset.filter((row) => row[column] === value);
          return builder;
        },
        gte(column: string, value: string) {
          dataset = dataset.filter((row) => row[column] >= value);
          return builder;
        },
        lte(column: string, value: string) {
          dataset = dataset.filter((row) => row[column] <= value);
          return builder;
        },
        or(expression: string) {
          const parts = expression.split(',');
          dataset = dataset.filter((row) => {
            return parts.some((part) => {
              const match = part.match(/([^\.]+)\.in\.\((.+)\)/);
              if (match) {
                const [, column, list] = match;
                const values = list.split(',').map((value) => value.trim());
                return values.includes(String(row[column] ?? ''));
              }
              return false;
            });
          });
          return builder;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          dataset.sort((a, b) => {
            if (a[column] === b[column]) return 0;
            const comparison = a[column] > b[column] ? 1 : -1;
            return opts?.ascending === false ? -comparison : comparison;
          });
          return builder;
        },
        range(start: number, end: number) {
          const count = options?.count === 'exact' ? dataset.length : undefined;
          const data = dataset.slice(start, end + 1);
          return Promise.resolve({ data, count, error: null });
        }
      };
      return builder;
    }
  };
}

function createEventsQuery(state: TableState) {
  return {
    select() {
      return Promise.resolve({ data: [...state.events], error: null });
    }
  };
}

function createRemindersSentQuery(state: TableState) {
  return {
    select() {
      return {
        eq(column: string, value: any) {
          const matches = selectBy(state.remindersSent.values(), (row) => row[column] === value);
          return {
            limit(count: number) {
              return Promise.resolve({ data: matches.slice(0, count), error: null });
            }
          };
        }
      };
    },
    insert(row: Row) {
      state.remindersSent.set(row.key, { ...row });
      return Promise.resolve({ data: row, error: null });
    }
  };
}

function createDevicesQuery(state: TableState) {
  return {
    select(_columns?: string) {
      return {
        eq(column: string, value: any) {
          const matches = selectBy(state.devices, (row) => row[column] === value);
          return Promise.resolve({ data: matches, error: null });
        }
      };
    }
  };
}

function createGenericDelete(state: TableState, table: keyof TableState) {
  return {
    eq(column: string, value: any) {
      const collection = state[table] as any;
      if (collection instanceof Map) {
        for (const [key, row] of collection.entries()) {
          if (row[column] === value) {
            collection.delete(key);
          }
        }
      } else if (Array.isArray(collection)) {
        const index = collection.findIndex((row: Row) => row[column] === value);
        if (index >= 0) {
          collection.splice(index, 1);
        }
      }
      return Promise.resolve({ error: null });
    }
  };
}

export function buildSupabaseMock() {
  const state = createInitialState();

  const client = {
    from(table: string) {
      switch (table) {
        case 'users':
          return createUsersQuery(state);
        case 'sessions':
          return createSessionsQuery(state);
        case 'classes':
          return createClassesQuery(state);
        case 'audit_logs':
          return createAuditLogsQuery(state);
        case 'invitations':
          return createInvitationsQuery(state);
        case 'events':
          return createEventsQuery(state);
        case 'reminders_sent':
          return createRemindersSentQuery(state);
        case 'devices':
          return createDevicesQuery(state);
        default:
          throw new Error(`Unhandled table ${table}`);
      }
    },
    deleteFrom(table: string) {
      return createGenericDelete(state, table as keyof TableState);
    }
  } as any;

  function reset() {
    const fresh = createInitialState();
    state.users = fresh.users;
    state.sessions = fresh.sessions;
    state.classes = fresh.classes;
    state.auditLogs = fresh.auditLogs;
    state.invitations = fresh.invitations;
    state.events = fresh.events;
    state.remindersSent = fresh.remindersSent;
    state.devices = fresh.devices;
  }

  return {
    getSupabase: () => client,
    __resetSupabase: reset,
    __state: state
  };
}
