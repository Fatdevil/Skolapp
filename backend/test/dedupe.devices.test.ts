import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/metrics.js', () => {
  return {
    incrementDevicesDeduplicated: vi.fn()
  };
});

const metricsModule = await import('../src/metrics.js');
const { incrementDevicesDeduplicated } = metricsModule as unknown as {
  incrementDevicesDeduplicated: ReturnType<typeof vi.fn>;
};

const { dedupeDevices } = await import('../scripts/dedupe-devices.js');

type MutableDeviceRow = {
  id: string;
  token_hash: string | null;
  user_id: string | null;
  class_id: string | null;
  expo_token: string | null;
  expo_token_iv: string | null;
  expo_token_tag: string | null;
  last_seen_at: string | null;
  created_at: string | null;
};

class FakeSelectBuilder {
  private filters: Array<(row: MutableDeviceRow) => boolean> = [];
  private orders: Array<{ column: keyof MutableDeviceRow; ascending: boolean }> = [];
  private limitCount: number | undefined;

  constructor(private readonly rows: MutableDeviceRow[]) {}

  select(): this {
    return this;
  }

  not(column: keyof MutableDeviceRow, operator: 'is', value: any): this {
    if (operator === 'is' && value === null) {
      this.filters.push((row) => row[column] !== null);
      return this;
    }
    throw new Error('Unsupported not operation in fake client');
  }

  eq(column: keyof MutableDeviceRow, value: any): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gt(column: keyof MutableDeviceRow, value: any): this {
    this.filters.push((row) => String(row[column] ?? '') > String(value ?? ''));
    return this;
  }

  order(column: keyof MutableDeviceRow, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  private materialise(): MutableDeviceRow[] {
    let data = this.rows.map((row) => ({ ...row }));
    for (const filter of this.filters) {
      data = data.filter(filter);
    }
    if (this.orders.length > 0) {
      data.sort((a, b) => {
        for (const order of this.orders) {
          const aValue = String(a[order.column] ?? '');
          const bValue = String(b[order.column] ?? '');
          if (aValue === bValue) continue;
          if (aValue < bValue) {
            return order.ascending ? -1 : 1;
          }
          return order.ascending ? 1 : -1;
        }
        return 0;
      });
    }
    if (typeof this.limitCount === 'number') {
      data = data.slice(0, this.limitCount);
    }
    return data;
  }

  then<TResult1 = { data: MutableDeviceRow[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: MutableDeviceRow[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const payload = { data: this.materialise(), error: null as const };
      if (!onfulfilled) {
        return Promise.resolve(payload as unknown as TResult1);
      }
      return Promise.resolve(onfulfilled(payload));
    } catch (err) {
      if (!onrejected) {
        return Promise.reject(err);
      }
      return Promise.resolve(onrejected(err));
    }
  }
}

class FakeUpdateBuilder {
  constructor(private readonly rows: MutableDeviceRow[], private readonly values: Partial<MutableDeviceRow>) {}

  async eq(column: keyof MutableDeviceRow, value: any) {
    const target = this.rows.find((row) => row[column] === value);
    if (target) {
      Object.assign(target, this.values);
    }
    return { data: target ? { ...target } : null, error: null };
  }
}

class FakeDeleteBuilder {
  constructor(private readonly rows: MutableDeviceRow[]) {}

  async in(column: keyof MutableDeviceRow, values: any[]) {
    const removal = new Set(values.map(String));
    let index = 0;
    while (index < this.rows.length) {
      const row = this.rows[index]!;
      if (removal.has(String(row[column] ?? ''))) {
        this.rows.splice(index, 1);
      } else {
        index++;
      }
    }
    return { error: null };
  }
}

class FakeDevicesTable {
  constructor(private readonly rows: MutableDeviceRow[]) {}

  select(_columns?: string) {
    return new FakeSelectBuilder(this.rows);
  }

  update(values: Partial<MutableDeviceRow>) {
    return new FakeUpdateBuilder(this.rows, values);
  }

  delete() {
    return new FakeDeleteBuilder(this.rows);
  }
}

class FakeSupabaseClient {
  private readonly rows: MutableDeviceRow[];

  constructor(rows: MutableDeviceRow[]) {
    this.rows = rows.map((row) => ({ ...row }));
  }

  from(table: string) {
    if (table !== 'devices') {
      throw new Error('FakeSupabaseClient only supports the devices table');
    }
    return new FakeDevicesTable(this.rows);
  }

  snapshot() {
    return this.rows.map((row) => ({ ...row }));
  }
}

function createLogger() {
  const lines: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  return {
    log: (message: unknown) => {
      lines.push(String(message));
    },
    warn: (message: unknown) => {
      warnings.push(String(message));
    },
    error: (message: unknown) => {
      errors.push(String(message));
    },
    lines,
    warnings,
    errors
  };
}

function baseRows(): MutableDeviceRow[] {
  return [
    {
      id: 'dev-001',
      token_hash: 'aaa',
      user_id: null,
      class_id: 'class-a-latest',
      expo_token: 'expo-a-latest',
      expo_token_iv: 'iv-a-latest',
      expo_token_tag: 'tag-a-latest',
      last_seen_at: '2025-01-02T00:00:00Z',
      created_at: '2025-01-01T00:00:00Z'
    },
    {
      id: 'dev-002',
      token_hash: 'aaa',
      user_id: 'user-a',
      class_id: 'class-a-user',
      expo_token: 'expo-a-user',
      expo_token_iv: 'iv-a-user',
      expo_token_tag: 'tag-a-user',
      last_seen_at: '2024-12-31T00:00:00Z',
      created_at: '2024-12-30T00:00:00Z'
    },
    {
      id: 'dev-003',
      token_hash: 'bbb',
      user_id: null,
      class_id: 'class-b-new',
      expo_token: 'expo-b-new',
      expo_token_iv: 'iv-b-new',
      expo_token_tag: 'tag-b-new',
      last_seen_at: '2025-01-03T00:00:00Z',
      created_at: '2024-12-31T00:00:00Z'
    },
    {
      id: 'dev-004',
      token_hash: 'bbb',
      user_id: 'user-b',
      class_id: 'class-b-user',
      expo_token: 'expo-b-user',
      expo_token_iv: 'iv-b-user',
      expo_token_tag: 'tag-b-user',
      last_seen_at: '2024-12-28T00:00:00Z',
      created_at: '2024-12-27T00:00:00Z'
    },
    {
      id: 'dev-005',
      token_hash: 'bbb',
      user_id: null,
      class_id: 'class-b-mid',
      expo_token: 'expo-b-mid',
      expo_token_iv: 'iv-b-mid',
      expo_token_tag: 'tag-b-mid',
      last_seen_at: '2024-12-29T00:00:00Z',
      created_at: '2024-12-28T00:00:00Z'
    },
    {
      id: 'dev-006',
      token_hash: 'ccc',
      user_id: null,
      class_id: 'class-c-old',
      expo_token: 'expo-c-old',
      expo_token_iv: 'iv-c-old',
      expo_token_tag: 'tag-c-old',
      last_seen_at: '2024-12-30T00:00:00Z',
      created_at: '2024-12-29T00:00:00Z'
    },
    {
      id: 'dev-007',
      token_hash: 'ccc',
      user_id: null,
      class_id: 'class-c-new',
      expo_token: 'expo-c-new',
      expo_token_iv: 'iv-c-new',
      expo_token_tag: 'tag-c-new',
      last_seen_at: '2025-01-04T00:00:00Z',
      created_at: '2024-12-30T00:00:00Z'
    }
  ];
}

function conflictingRows(): MutableDeviceRow[] {
  return [
    {
      id: 'mix-001',
      token_hash: 'mix',
      user_id: 'user-old',
      class_id: 'class-old',
      expo_token: 'expo-old',
      expo_token_iv: 'iv-old',
      expo_token_tag: 'tag-old',
      last_seen_at: '2024-12-01T00:00:00Z',
      created_at: '2024-12-01T00:00:00Z'
    },
    {
      id: 'mix-002',
      token_hash: 'mix',
      user_id: 'user-new',
      class_id: 'class-new',
      expo_token: 'expo-new',
      expo_token_iv: 'iv-new',
      expo_token_tag: 'tag-new',
      last_seen_at: '2025-01-05T00:00:00Z',
      created_at: '2024-12-15T00:00:00Z'
    },
    {
      id: 'mix-003',
      token_hash: 'mix',
      user_id: null,
      class_id: 'class-latest',
      expo_token: 'expo-latest',
      expo_token_iv: 'iv-latest',
      expo_token_tag: 'tag-latest',
      last_seen_at: '2025-01-06T00:00:00Z',
      created_at: '2024-12-20T00:00:00Z'
    }
  ];
}

describe('dedupe-devices keyset pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DEDUP_PAGE_SIZE;
  });

  it('performs a dry-run without mutating data and still visits every duplicate group', async () => {
    const supabase = new FakeSupabaseClient(baseRows());
    const logger = createLogger();

    const result = await dedupeDevices({ supabase: supabase as unknown as any, logger, chunkSize: 3 });

    expect(result.dryRun).toBe(true);
    expect(result.groups).toBe(3);
    expect(result.batches).toBeGreaterThan(1);
    expect(supabase.snapshot()).toHaveLength(7);
    expect(logger.lines.some((line) => line.includes('batches='))).toBe(true);
    expect(incrementDevicesDeduplicated).not.toHaveBeenCalled();
  });

  it('deduplicates rows across page boundaries and preserves the canonical record', async () => {
    const supabase = new FakeSupabaseClient(baseRows());
    const logger = createLogger();

    const result = await dedupeDevices({
      supabase: supabase as unknown as any,
      logger,
      chunkSize: 3,
      apply: true
    });

    expect(result.dryRun).toBe(false);
    expect(result.groups).toBe(3);
    expect(result.deleted).toBe(4);
    expect(result.merged).toBe(3);
    expect(result.batches).toBeGreaterThan(1);

    const rows = supabase.snapshot();
    expect(rows).toHaveLength(3);

    const groupA = rows.filter((row) => row.token_hash === 'aaa');
    expect(groupA).toHaveLength(1);
    expect(groupA[0]).toMatchObject({
      id: 'dev-002',
      user_id: 'user-a',
      class_id: 'class-a-latest',
      expo_token: 'expo-a-latest',
      last_seen_at: '2025-01-02T00:00:00Z'
    });

    const groupB = rows.filter((row) => row.token_hash === 'bbb');
    expect(groupB).toHaveLength(1);
    expect(groupB[0]).toMatchObject({
      id: 'dev-004',
      user_id: 'user-b',
      class_id: 'class-b-new',
      expo_token: 'expo-b-new',
      last_seen_at: '2025-01-03T00:00:00Z'
    });

    const groupC = rows.filter((row) => row.token_hash === 'ccc');
    expect(groupC).toHaveLength(1);
    expect(groupC[0]).toMatchObject({
      id: 'dev-007',
      user_id: null,
      class_id: 'class-c-new',
      expo_token: 'expo-c-new',
      last_seen_at: '2025-01-04T00:00:00Z'
    });

    expect(incrementDevicesDeduplicated).toHaveBeenCalledTimes(3);
    const totalIncremented = incrementDevicesDeduplicated.mock.calls.reduce(
      (sum: number, args: any[]) => sum + Number(args[0] ?? 0),
      0
    );
    expect(totalIncremented).toBe(4);
    expect(logger.lines.some((line) => line.includes('totalDeleted=4'))).toBe(true);
  });

  it('selects the most appropriate canonical record when user_ids and timestamps disagree', async () => {
    const supabase = new FakeSupabaseClient(conflictingRows());
    const logger = createLogger();

    const result = await dedupeDevices({
      supabase: supabase as unknown as any,
      logger,
      chunkSize: 2,
      apply: true
    });

    expect(result.groups).toBe(1);
    expect(result.deleted).toBe(2);

    const rows = supabase.snapshot();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'mix-002',
      user_id: 'user-new',
      class_id: 'class-latest',
      expo_token: 'expo-latest',
      last_seen_at: '2025-01-06T00:00:00Z'
    });
    expect(logger.warnings.some((line) => line.includes('flera user_id'))).toBe(true);
  });
});
