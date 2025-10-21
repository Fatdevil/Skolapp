import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getSupabase } from '../src/db/supabase.js';
import { incrementDevicesDeduplicated } from '../src/metrics.js';

dotenv.config();

type ConsoleLike = Pick<typeof console, 'log' | 'warn' | 'error'>;

type DeviceRow = {
  id: string;
  user_id: string | null;
  class_id: string | null;
  expo_token: string | null;
  expo_token_iv: string | null;
  expo_token_tag: string | null;
  token_hash: string | null;
  last_seen_at: string | null;
  created_at: string | null;
};

type DedupeOptions = {
  apply?: boolean;
  chunkSize?: number;
  logger?: ConsoleLike;
  supabase?: ReturnType<typeof getSupabase>;
};

export type DedupeResult = {
  groups: number;
  merged: number;
  deleted: number;
  failures: number;
  dryRun: boolean;
  batches: number;
};

function parseTimestamp(value: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function pickCanonical(rows: DeviceRow[]): DeviceRow {
  const sorted = [...rows].sort((a, b) => {
    const aHasUser = Boolean(a.user_id);
    const bHasUser = Boolean(b.user_id);
    if (aHasUser !== bHasUser) {
      return aHasUser ? -1 : 1;
    }
    const aTs = parseTimestamp(a.last_seen_at ?? a.created_at);
    const bTs = parseTimestamp(b.last_seen_at ?? b.created_at);
    if (aTs === bTs) return 0;
    return aTs > bTs ? -1 : 1;
  });
  return sorted[0] ?? rows[0]!;
}

function pickMostRecent(rows: DeviceRow[]): DeviceRow {
  const sorted = [...rows].sort((a, b) => {
    const aTs = parseTimestamp(a.last_seen_at ?? a.created_at);
    const bTs = parseTimestamp(b.last_seen_at ?? b.created_at);
    if (aTs === bTs) return 0;
    return aTs > bTs ? -1 : 1;
  });
  return sorted[0] ?? rows[0]!;
}

async function processGroup(
  client: ReturnType<typeof getSupabase>,
  rows: DeviceRow[],
  apply: boolean,
  logger: ConsoleLike
): Promise<{ deleted: number; merged: number; failures: number }> {
  if (rows.length <= 1) {
    return { deleted: 0, merged: 0, failures: 0 };
  }
  const canonical = pickCanonical(rows);
  const latest = pickMostRecent(rows);
  const duplicates = rows.filter((row) => row.id !== canonical.id);
  const userIds = new Set(rows.map((row) => row.user_id).filter((value): value is string => Boolean(value)));
  if (userIds.size > 1) {
    logger.warn(`Dubblett-grupp ${canonical.token_hash} har flera user_id: ${Array.from(userIds).join(', ')}`);
  }

  const mergedUserId = canonical.user_id ?? Array.from(userIds)[0] ?? null;
  const updatePayload: Record<string, any> = {
    class_id: latest.class_id,
    expo_token: latest.expo_token,
    expo_token_iv: latest.expo_token_iv,
    expo_token_tag: latest.expo_token_tag,
    last_seen_at: latest.last_seen_at ?? latest.created_at ?? canonical.last_seen_at ?? canonical.created_at ?? null
  };
  if (mergedUserId && mergedUserId !== canonical.user_id) {
    updatePayload.user_id = mergedUserId;
  }

  if (apply) {
    try {
      const { error: updateError } = await client.from('devices').update(updatePayload).eq('id', canonical.id);
      if (updateError) {
        logger.error(`Misslyckades att uppdatera kanonisk device ${canonical.id}: ${updateError.message ?? updateError}`);
        return { deleted: 0, merged: 0, failures: 1 };
      }
    } catch (err) {
      logger.error(`Misslyckades att uppdatera kanonisk device ${canonical.id}: ${String(err)}`);
      return { deleted: 0, merged: 0, failures: 1 };
    }
  } else {
    logger.log(`[dry-run] skulle uppdatera kanonisk device ${canonical.id}`);
  }

  const deleteIds = duplicates.map((row) => row.id);
  let failures = 0;
  if (deleteIds.length > 0) {
    if (apply) {
      try {
        const { error: deleteError } = await client.from('devices').delete().in('id', deleteIds);
        if (deleteError) {
          logger.error(`Misslyckades att ta bort dubbletter (${deleteIds.join(', ')}): ${deleteError.message ?? deleteError}`);
          failures += 1;
        } else {
          incrementDevicesDeduplicated(deleteIds.length);
        }
      } catch (err) {
        logger.error(`Misslyckades att ta bort dubbletter (${deleteIds.join(', ')}): ${String(err)}`);
        failures += 1;
      }
    } else {
      logger.log(`[dry-run] skulle ta bort dubbletter: ${deleteIds.join(', ')}`);
    }
  }

  return { deleted: deleteIds.length, merged: 1, failures };
}

function groupByTokenHash(rows: DeviceRow[]): DeviceRow[][] {
  const groups: DeviceRow[][] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index]!;
    const hash = row.token_hash;
    if (!hash) {
      index++;
      continue;
    }
    const group: DeviceRow[] = [row];
    index++;
    while (index < rows.length && rows[index]!.token_hash === hash) {
      group.push(rows[index]!);
      index++;
    }
    if (group.length > 1) {
      groups.push(group);
    }
  }
  return groups;
}

const DEFAULT_PAGE_SIZE = 1000;

function resolvePageSize(options: DedupeOptions): number {
  if (options.chunkSize && options.chunkSize > 0) {
    return options.chunkSize;
  }
  const envValue = Number.parseInt(process.env.DEDUP_PAGE_SIZE ?? '', 10);
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue;
  }
  return DEFAULT_PAGE_SIZE;
}

async function fetchFirstPage(
  client: ReturnType<typeof getSupabase>,
  fields: string,
  pageSize: number
): Promise<{ data: DeviceRow[]; error: any }> {
  const { data, error } = await client
    .from('devices')
    .select(fields)
    .not('token_hash', 'is', null)
    .order('token_hash', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true, nullsFirst: false })
    .limit(pageSize);
  return { data: (data ?? []) as DeviceRow[], error };
}

async function fetchPageAfter(
  client: ReturnType<typeof getSupabase>,
  fields: string,
  pageSize: number,
  lastKey: { token_hash: string; id: string }
): Promise<{ data: DeviceRow[]; error: any }>
{
  const batches: DeviceRow[] = [];

  const { data: sameHashData, error: sameHashError } = await client
    .from('devices')
    .select(fields)
    .eq('token_hash', lastKey.token_hash)
    .gt('id', lastKey.id)
    .order('token_hash', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true, nullsFirst: false })
    .limit(pageSize);

  if (sameHashError) {
    return { data: [], error: sameHashError };
  }

  const sameHashRows = (sameHashData ?? []) as DeviceRow[];
  if (sameHashRows.length > 0) {
    batches.push(...sameHashRows);
  }

  if (sameHashRows.length >= pageSize) {
    return { data: batches, error: null };
  }

  const remaining = pageSize - sameHashRows.length;
  const { data: nextHashData, error: nextHashError } = await client
    .from('devices')
    .select(fields)
    .gt('token_hash', lastKey.token_hash)
    .order('token_hash', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true, nullsFirst: false })
    .limit(remaining);

  if (nextHashError) {
    return { data: [], error: nextHashError };
  }

  const nextHashRows = (nextHashData ?? []) as DeviceRow[];
  if (nextHashRows.length > 0) {
    batches.push(...nextHashRows);
  }

  return { data: batches, error: null };
}

export async function dedupeDevices(options: DedupeOptions = {}): Promise<DedupeResult> {
  const logger = options.logger ?? console;
  const pageSize = resolvePageSize(options);
  const apply = options.apply ?? false;
  const dryRun = !apply;

  let supabase = options.supabase;
  if (!supabase) {
    try {
      supabase = getSupabase();
    } catch (err) {
      if (dryRun) {
        logger.warn('Supabase är inte konfigurerat – hoppar över dry-run för dedupe.');
        return { groups: 0, merged: 0, deleted: 0, failures: 0, dryRun };
      }
      throw err;
    }
  }
  if (!supabase) {
    throw new Error('Supabase client saknas');
  }
  const client = supabase;

  let groups = 0;
  let merged = 0;
  let deleted = 0;
  let failures = 0;
  let carry: DeviceRow[] = [];
  let batches = 0;
  let lastKey: { token_hash: string; id: string } | null = null;

  const fields =
    'id,user_id,class_id,expo_token,expo_token_iv,expo_token_tag,token_hash,last_seen_at,created_at';

  while (true) {
    const result = lastKey
      ? await fetchPageAfter(client, fields, pageSize, lastKey)
      : await fetchFirstPage(client, fields, pageSize);

    const { data, error } = result;

    if (error) {
      logger.error(`Kunde inte läsa devices för dedupe: ${error.message ?? error}`);
      failures++;
      break;
    }

    const rows = (data ?? []) as DeviceRow[];
    if (rows.length === 0) {
      break;
    }

    batches++;

    let anchorIndex = rows.length - 1;
    while (anchorIndex >= 0 && !rows[anchorIndex]!.token_hash) {
      anchorIndex--;
    }
    if (anchorIndex >= 0) {
      const anchor = rows[anchorIndex]!;
      lastKey = { token_hash: anchor.token_hash!, id: anchor.id };
    } else {
      lastKey = null;
    }

    const filtered = rows.filter((row) => row.token_hash);
    if (filtered.length === 0 && carry.length === 0) {
      if (rows.length < pageSize) {
        break;
      }
      continue;
    }

    const combined = [...carry, ...filtered];
    let processUntil = combined.length;
    if (filtered.length > 0 && rows.length === pageSize) {
      const lastHash = filtered[filtered.length - 1]!.token_hash;
      if (lastHash) {
        let index = combined.length - 1;
        while (index >= 0 && combined[index]!.token_hash === lastHash) {
          index--;
        }
        processUntil = index + 1;
        carry = combined.slice(processUntil);
      }
    } else {
      carry = [];
    }

    const toProcess = combined.slice(0, processUntil);
    const duplicateGroups = groupByTokenHash(toProcess);
    let batchGroups = 0;
    let batchDeleted = 0;
    let batchMerged = 0;
    for (const group of duplicateGroups) {
      groups++;
      batchGroups++;
      const result = await processGroup(client, group, apply, logger);
      merged += result.merged;
      batchMerged += result.merged;
      deleted += result.deleted;
      batchDeleted += result.deleted;
      failures += result.failures;
    }

    logger.log(
      `Batch ${batches}: groupsSeen=${batchGroups}, deleted=${batchDeleted}, merged=${batchMerged}, totalDeleted=${deleted}`
    );

    if (rows.length < pageSize) {
      break;
    }
  }

  if (carry.length > 0) {
    const duplicateGroups = groupByTokenHash(carry);
    let batchGroups = 0;
    let batchDeleted = 0;
    let batchMerged = 0;
    for (const group of duplicateGroups) {
      groups++;
      batchGroups++;
      const result = await processGroup(client, group, apply, logger);
      merged += result.merged;
      batchMerged += result.merged;
      deleted += result.deleted;
      batchDeleted += result.deleted;
      failures += result.failures;
    }
    if (batchGroups > 0) {
      batches++;
      logger.log(
        `Batch ${batches}: groupsSeen=${batchGroups}, deleted=${batchDeleted}, merged=${batchMerged}, totalDeleted=${deleted}`
      );
    }
  }

  logger.log(
    `Dedupe klar: groups=${groups}, merged=${merged}, deleted=${deleted}, failures=${failures}, dryRun=${dryRun}, batches=${batches}`
  );

  return { groups, merged, deleted, failures, dryRun, batches };
}

async function main() {
  const applyFlag = process.argv.includes('--apply');
  const dryFlag = process.argv.includes('--dry-run') || process.argv.includes('--dry');
  const apply = applyFlag && !dryFlag;
  if (!apply) {
    console.log('[dedupe-devices] Kör i dry-run-läge. Lägg till --apply för att ta bort dubbletter.');
  }
  const result = await dedupeDevices({ apply });
  if (result.failures > 0) {
    process.exitCode = 1;
  }
}

const isCli = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  void main().catch((err) => {
    console.error(String(err));
    process.exitCode = 1;
  });
}
