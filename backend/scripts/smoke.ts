import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import { fetch } from 'undici';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseUrl = (process.env.API_BASE_URL || 'http://localhost:3333').replace(/\/$/, '');
const cookiePath = path.resolve(path.join(__dirname, '../../.tmp/cookies.txt'));

type Check = {
  name: string;
  run: () => Promise<void>;
};

function log(message: string) {
  process.stdout.write(`${message}\n`);
}

function ensure(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadCookie(): Promise<string> {
  const content = await readFile(cookiePath, 'utf8');
  const cookie = content.trim();
  if (!cookie) {
    throw new Error(`Cookiefilen (${cookiePath}) är tom.`);
  }
  return cookie;
}

const checks: Check[] = [
  {
    name: 'GET /health',
    run: async () => {
      const res = await fetch(`${baseUrl}/health`);
      ensure(res.status === 200, `/health svarade ${res.status}`);
    }
  },
  {
    name: 'POST /auth/magic/initiate rate-limit headers',
    run: async () => {
      const res = await fetch(`${baseUrl}/auth/magic/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'smoke-check@example.com', classCode: 'SMOKE' })
      });
      const limit = res.headers.get('x-ratelimit-limit');
      const remaining = res.headers.get('x-ratelimit-remaining');
      const reset = res.headers.get('x-ratelimit-reset');
      ensure(limit, 'x-ratelimit-limit saknas');
      ensure(remaining, 'x-ratelimit-remaining saknas');
      ensure(reset, 'x-ratelimit-reset saknas');
    }
  },
  {
    name: 'GET /auth/whoami utan cookie',
    run: async () => {
      const res = await fetch(`${baseUrl}/auth/whoami`, { redirect: 'manual' });
      ensure(res.status === 401, `/auth/whoami utan cookie gav ${res.status}`);
    }
  },
  {
    name: 'GET /auth/whoami med bootstrap-cookie',
    run: async () => {
      const cookie = await loadCookie();
      const res = await fetch(`${baseUrl}/auth/whoami`, {
        headers: { cookie }
      });
      ensure(res.status === 200, `/auth/whoami med cookie gav ${res.status}`);
      const payload = await res.json();
      ensure(payload?.user?.role, 'Svaret saknar user.role');
    }
  }
];

async function main() {
  log(`Kör smoke-tests mot ${baseUrl}`);
  const failures: string[] = [];
  for (const check of checks) {
    try {
      await check.run();
      log(`✓ ${check.name}`);
    } catch (err) {
      failures.push(`${check.name}: ${String(err)}`);
      log(`✗ ${check.name}: ${String(err)}`);
    }
  }

  if (failures.length > 0) {
    process.stderr.write(`\nSmoke-tests misslyckades:\n${failures.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    log('\nAlla smoke-tests passerade.');
  }
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exitCode = 1;
});
