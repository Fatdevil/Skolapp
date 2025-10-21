import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hmacTokenHash, encryptPII } from '../src/util/crypto.js';
import { backfillDeviceTokenHashes } from '../scripts/backfill-device-token-hash.js';
import { dedupeDevices } from '../scripts/dedupe-devices.js';
import { getMetricsSummary } from '../src/metrics.js';

type DeviceRecord = {
  id: string;
  class_id: string | null;
  user_id: string | null;
  expo_token: string | null;
  expo_token_iv: string | null;
  expo_token_tag: string | null;
  token_hash: string | null;
  created_at: string | null;
  last_seen_at: string | null;
};

type OrderOptions = { ascending?: boolean; nullsFirst?: boolean };

type ConsoleLike = Pick<typeof console, 'log' | 'warn' | 'error'>;

function cloneRow(row: DeviceRecord): DeviceRecord {
  return { ...row };
}

class SelectBuilder {
  private filters: Array<(row: DeviceRecord) => boolean> = [];
  private orderings: Array<{ column: keyof DeviceRecord; ascending: boolean; nullsFirst: boolean }> = [];
  private limitValue: number | null = null;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;

  constructor(private readonly rows: DeviceRecord[]) {}

  eq(column: keyof DeviceRecord | string, value: any) {
    this.filters.push((row) => (row as any)[column] === value);
    return this;
  }

  is(column: keyof DeviceRecord | string, value: any) {
    this.filters.push((row) => {
      const current = (row as any)[column];
      return value === null ? current === null : current === value;
    });
    return this;
  }

  not(column: keyof DeviceRecord | string, operator: 'is', value: any) {
    if (operator === 'is' && value === null) {
      this.filters.push((row) => (row as any)[column] !== null);
      return this;
    }
    throw new Error('Unsupported not operation');
  }

  gt(column: keyof DeviceRecord | string, value: any) {
    this.filters.push((row) => {
      const current = (row as any)[column];
      if (current === null || current === undefined) return false;
      return current > value;
    });
    return this;
  }

  order(column: keyof DeviceRecord | string, options: OrderOptions = {}) {
    this.orderings.push({
      column: column as keyof DeviceRecord,
      ascending: options.ascending !== false,
      nullsFirst: options.nullsFirst === true
    });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  private execute(): DeviceRecord[] {
    let result = this.rows.map(cloneRow);
    for (const filter of this.filters) {
      result = result.filter(filter);
    }
    for (const ordering of this.orderings) {
      result.sort((a, b) => {
        const aValue = (a as any)[ordering.column];
        const bValue = (b as any)[ordering.column];
        if (aValue === bValue) return 0;
        if (aValue === null || aValue === undefined) {
          return ordering.nullsFirst ? -1 : 1;
        }
        if (bValue === null || bValue === undefined) {
          return ordering.nullsFirst ? 1 : -1;
        }
        if (aValue > bValue) {
          return ordering.ascending ? 1 : -1;
        }
        return ordering.ascending ? -1 : 1;
      });
    }
    if (this.rangeStart !== null && this.rangeEnd !== null) {
      result = result.slice(this.rangeStart, this.rangeEnd + 1);
    }
    if (this.limitValue !== null) {
      result = result.slice(0, this.limitValue);
    }
    return result;
  }

  async maybeSingle() {
    const data = this.execute();
    return { data: data[0] ?? null, error: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: DeviceRecord[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = { data: this.execute(), error: null };
      return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1));
    } catch (err) {
      if (onrejected) {
        return Promise.resolve(onrejected(err));
      }
      return Promise.reject(err);
    }
  }
}

class UpdateBuilder {
  constructor(private readonly rows: DeviceRecord[], private readonly values: Partial<DeviceRecord>) {}

  eq(column: keyof DeviceRecord | string, value: any) {
    const updated: DeviceRecord[] = [];
    for (const row of this.rows) {
      if ((row as any)[column] === value) {
        Object.assign(row, this.values);
        updated.push(cloneRow(row));
      }
    }
    return { data: updated, error: null };
  }
}

class DeleteBuilder {
  constructor(private readonly rows: DeviceRecord[]) {}

  eq(column: keyof DeviceRecord | string, value: any) {
    return this.in(column, [value]);
  }

  in(column: keyof DeviceRecord | string, values: any[]) {
    const removed: DeviceRecord[] = [];
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if (values.includes((this.rows[i] as any)[column])) {
        removed.push(this.rows[i]!);
        this.rows.splice(i, 1);
      }
    }
    return { data: removed.map(cloneRow), error: null };
  }
}

class DevicesTable {
  constructor(private readonly rows: DeviceRecord[]) {}

  select(_columns?: string) {
    return new SelectBuilder(this.rows);
  }

  insert(payload: DeviceRecord | DeviceRecord[]) {
    const items = Array.isArray(payload) ? payload : [payload];
    for (const item of items) {
      this.rows.push(cloneRow(item));
    }
    return { data: items.map(cloneRow), error: null };
  }

  update(values: Partial<DeviceRecord>) {
    return new UpdateBuilder(this.rows, values);
  }

  delete() {
    return new DeleteBuilder(this.rows);
  }
}

function createDevicesSupabaseMock() {
  const rows: DeviceRecord[] = [];
  const client = {
    from(table: string) {
      if (table !== 'devices') {
        throw new Error(`Unsupported table ${table}`);
      }
      return new DevicesTable(rows);
    }
  };
  return {
    client,
    rows,
    reset() {
      rows.splice(0, rows.length);
    }
  };
}

const store = createDevicesSupabaseMock();

vi.mock('../src/db/supabase.js', () => ({
  getSupabase: () => store.client
}));

const { registerDevice } = await import('../src/repos/devicesRepo.js');

const silentLogger: ConsoleLike = {
  log: () => {
    /* noop */
  },
  warn: () => {
    /* noop */
  },
  error: () => {
    /* noop */
  }
};

describe('hmacTokenHash', () => {
  it('is deterministic per token', () => {
    const a1 = hmacTokenHash('token-a');
    const a2 = hmacTokenHash('token-a');
    const b1 = hmacTokenHash('token-b');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b1);
  });
});

describe('registerDevice', () => {
  beforeEach(() => {
    store.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('upserts by token hash and updates last_seen_at', async () => {
    const before = await getMetricsSummary();
    await registerDevice('class-a', 'expo-token-1');
    expect(store.rows).toHaveLength(1);
    const first = store.rows[0]!;
    expect(first.token_hash).toBe(hmacTokenHash('expo-token-1'));
    const createdAt = first.created_at;
    expect(createdAt).toBeDefined();

    vi.setSystemTime(new Date('2024-01-01T00:05:00.000Z'));
    await registerDevice('class-b', 'expo-token-1');
    expect(store.rows).toHaveLength(1);
    const updated = store.rows[0]!;
    expect(updated.class_id).toBe('class-b');
    expect(updated.last_seen_at).toBe(new Date('2024-01-01T00:05:00.000Z').toISOString());
    expect(updated.created_at).toBe(createdAt);

    const after = await getMetricsSummary();
    expect(after.counters.devicesRegistered).toBe(before.counters.devicesRegistered + 2);
  });

  it('fills user_id on subsequent registration when missing', async () => {
    await registerDevice('class-a', 'expo-token-2');
    expect(store.rows[0]!.user_id).toBeNull();

    vi.setSystemTime(new Date('2024-01-01T00:10:00.000Z'));
    await registerDevice('class-a', 'expo-token-2', 'user-123');
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]!.user_id).toBe('user-123');
  });
});

describe('backfill and dedupe scripts', () => {
  beforeEach(() => {
    store.reset();
  });

  it('backfills missing token hashes from encrypted payloads', async () => {
    const encrypted = encryptPII('expo-token-3');
    store.rows.push({
      id: randomUUID(),
      class_id: 'class-a',
      user_id: null,
      expo_token: encrypted.ct,
      expo_token_iv: encrypted.iv,
      expo_token_tag: encrypted.tag,
      token_hash: null,
      created_at: '2024-01-01T00:00:00.000Z',
      last_seen_at: null
    });

    const result = await backfillDeviceTokenHashes({ supabase: store.client, logger: silentLogger });
    expect(result.updated).toBe(1);
    expect(store.rows[0]!.token_hash).toBe(hmacTokenHash('expo-token-3'));
  });

  it('deduplicates devices sharing the same token hash', async () => {
    const plaintext = 'expo-token-4';
    const hash = hmacTokenHash(plaintext);
    const first = encryptPII(plaintext);
    const second = encryptPII(plaintext);
    store.rows.push(
      {
        id: 'device-1',
        class_id: 'class-a',
        user_id: null,
        expo_token: first.ct,
        expo_token_iv: first.iv,
        expo_token_tag: first.tag,
        token_hash: hash,
        created_at: '2024-01-01T00:00:00.000Z',
        last_seen_at: '2024-01-01T00:00:00.000Z'
      },
      {
        id: 'device-2',
        class_id: 'class-b',
        user_id: 'user-xyz',
        expo_token: second.ct,
        expo_token_iv: second.iv,
        expo_token_tag: second.tag,
        token_hash: hash,
        created_at: '2024-01-01T01:00:00.000Z',
        last_seen_at: '2024-01-01T01:00:00.000Z'
      }
    );

    const beforeMetrics = await getMetricsSummary();
    const result = await dedupeDevices({ supabase: store.client, apply: true, logger: silentLogger });
    expect(result.deleted).toBe(1);
    expect(store.rows).toHaveLength(1);
    const remaining = store.rows[0]!;
    expect(remaining.id).toBe('device-2');
    expect(remaining.class_id).toBe('class-b');
    expect(remaining.user_id).toBe('user-xyz');

    const afterMetrics = await getMetricsSummary();
    expect(afterMetrics.counters.devicesDeduplicated).toBe(beforeMetrics.counters.devicesDeduplicated + 1);
  });
});
