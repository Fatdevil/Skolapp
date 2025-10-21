import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getSupabase } from '../src/db/supabase.js';
import { decryptPII, hmacTokenHash } from '../src/util/crypto.js';

dotenv.config();

type ConsoleLike = Pick<typeof console, 'log' | 'warn' | 'error'>;

type DeviceRow = {
  id: string;
  expo_token: string | null;
  expo_token_iv: string | null;
  expo_token_tag: string | null;
  token_hash: string | null;
  created_at: string | null;
};

type BackfillOptions = {
  chunkSize?: number;
  dryRun?: boolean;
  logger?: ConsoleLike;
  supabase?: ReturnType<typeof getSupabase>;
};

export type BackfillResult = {
  processed: number;
  updated: number;
  skipped: number;
  failures: number;
};

function decryptToken(row: DeviceRow): string {
  if (!row.expo_token) return '';
  if (row.expo_token_iv && row.expo_token_tag) {
    return decryptPII({ ct: row.expo_token, iv: row.expo_token_iv, tag: row.expo_token_tag });
  }
  return decryptPII(row.expo_token);
}

export async function backfillDeviceTokenHashes(options: BackfillOptions = {}): Promise<BackfillResult> {
  const logger = options.logger ?? console;
  const chunkSize = options.chunkSize ?? 500;
  const dryRun = options.dryRun ?? false;

  let supabase = options.supabase;
  if (!supabase) {
    try {
      supabase = getSupabase();
    } catch (err) {
      if (dryRun) {
        logger.warn('Supabase är inte konfigurerat – hoppar över dry-run för backfill.');
        return { processed: 0, updated: 0, skipped: 0, failures: 0 };
      }
      throw err;
    }
  }
  if (!supabase) {
    throw new Error('Supabase client saknas');
  }
  const client = supabase;

  let lastCreatedAt: string | null = null;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failures = 0;

  while (true) {
    let query = client
      .from('devices')
      .select('id,expo_token,expo_token_iv,expo_token_tag,token_hash,created_at')
      .is('token_hash', null)
      .order('created_at', { ascending: true })
      .limit(chunkSize);

    if (lastCreatedAt) {
      query = query.gt('created_at', lastCreatedAt);
    }

    const { data, error } = await query;
    if (error) {
      logger.error(`Kunde inte läsa devices: ${error.message ?? error}`);
      failures++;
      break;
    }

    const rows = (data ?? []) as DeviceRow[];
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      processed++;
      if (row.token_hash) {
        skipped++;
        continue;
      }
      if (!row.expo_token) {
        logger.warn(`Hoppar över device ${row.id} utan expo_token`);
        skipped++;
        continue;
      }
      try {
        const plain = decryptToken(row);
        if (!plain) {
          logger.warn(`Hoppar över device ${row.id}: dekryptering gav tomt resultat`);
          skipped++;
          continue;
        }
        const tokenHash = hmacTokenHash(plain);
        if (dryRun) {
          logger.log(`[dry-run] skulle uppdatera device ${row.id}`);
          updated++;
        } else {
          const { error: updateError } = await client
            .from('devices')
            .update({ token_hash: tokenHash })
            .eq('id', row.id);
          if (updateError) {
            throw updateError;
          }
          updated++;
        }
      } catch (err) {
        logger.error(`Misslyckades att backfilla device ${row.id}: ${String(err)}`);
        failures++;
      }
    }

    lastCreatedAt = rows[rows.length - 1]?.created_at ?? lastCreatedAt;
    if (!lastCreatedAt) {
      break;
    }
    if (rows.length < chunkSize) {
      break;
    }
  }

  logger.log(
    `Backfill klar: processed=${processed}, updated=${updated}, skipped=${skipped}, failures=${failures}, dryRun=${dryRun}`
  );
  return { processed, updated, skipped, failures };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
  try {
    const result = await backfillDeviceTokenHashes({ dryRun });
    if (result.failures > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(String(err));
    process.exitCode = 1;
  }
}

const isCli = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  void main();
}
