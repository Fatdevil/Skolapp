import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import { fetch } from 'undici';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sqlDir = path.resolve(__dirname, '../sql');

function log(message: string) {
  process.stdout.write(`${message}\n`);
}

function getProjectRef(supabaseUrl: string): string {
  try {
    const parsed = new URL(supabaseUrl);
    const host = parsed.hostname;
    if (host === 'localhost' || host.startsWith('127.') || host.startsWith('192.168.') || host === '0.0.0.0') {
      throw new Error('Local Supabase instances require SUPABASE_DB_URL to run migrations.');
    }
    const parts = host.split('.');
    if (parts.length < 3 || parts[parts.length - 2] !== 'supabase') {
      return parts[0];
    }
    return parts[0];
  } catch (err) {
    throw new Error(`Kunde inte tolka projekt-referensen från SUPABASE_URL (${supabaseUrl}). ${String(err)}`);
  }
}

function isIgnorableError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('already exists') || normalized.includes('duplicate') || normalized.includes('already owned');
}

async function executeSql(query: string, projectRef: string, serviceRole: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`
    },
    body: JSON.stringify({
      query,
      api_key: serviceRole,
      db_slug: 'primary'
    })
  });

  const rawBody = await response.text();
  if (!response.ok) {
    if (rawBody && isIgnorableError(rawBody)) {
      log(`   ↳ Skipped (already applied)`);
      return;
    }
    throw new Error(rawBody || `Supabase API returned ${response.status}`);
  }

  if (!rawBody) return;
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed.error) {
      const message = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message || JSON.stringify(parsed.error);
      if (message && isIgnorableError(message)) {
        log(`   ↳ Skipped (already applied)`);
        return;
      }
      throw new Error(message || 'Okänt SQL-fel');
    }
  } catch (err) {
    // Supabase kan returnera tom body eller text; om JSON-parse misslyckas antar vi att allt gick bra.
    if (err instanceof SyntaxError) {
      return;
    }
    const message = String(err);
    if (!isIgnorableError(message)) {
      throw err;
    }
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL måste vara satt');
  }
  if (!serviceRole) {
    throw new Error('SUPABASE_SERVICE_ROLE måste vara satt');
  }

  const projectRef = getProjectRef(supabaseUrl);
  const files = (await readdir(sqlDir)).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const filePath = path.join(sqlDir, file);
    log(`→ Kör migration ${file}`);
    const sql = await readFile(filePath, 'utf8');
    try {
      await executeSql(sql, projectRef, serviceRole);
      log('   ✓ Klar');
    } catch (err) {
      if (err instanceof Error && err.message && isIgnorableError(err.message)) {
        log(`   ↳ Skipped (already applied)`);
        continue;
      }
      log(`   ✗ Misslyckades: ${String(err)}`);
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((err) => {
  log(`Migrationerna avbröts: ${String(err)}`);
  process.exitCode = 1;
});
