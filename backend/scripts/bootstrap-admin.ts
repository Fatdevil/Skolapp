import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import { fetch } from 'undici';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getArg(name: string): string | null {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? valueAfter(arg, prefix) : null;
}

function valueAfter(arg: string, prefix: string): string {
  return arg.slice(prefix.length);
}

async function main() {
  const email = getArg('email') ?? process.env.SMOKE_ADMIN_EMAIL ?? null;
  if (!email) {
    throw new Error('Ange e-post med --email=example@domain.se eller sätt SMOKE_ADMIN_EMAIL.');
  }

  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3333';
  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

  if (!bootstrapToken) {
    throw new Error('ADMIN_BOOTSTRAP_TOKEN saknas – kan inte bootstrapa administratör.');
  }

  const response = await fetch(`${apiBaseUrl}/admin/bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bootstrap-token': bootstrapToken
    },
    body: JSON.stringify({ email, secret: bootstrapToken })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Bootstrap misslyckades (${response.status}): ${bodyText || 'okänt fel'}`);
  }

  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  const sidCookie = setCookies.find((cookie) => cookie.startsWith('sid='));
  if (!sidCookie) {
    throw new Error('Kunde inte hitta sid-cookie i svaret. Kontrollera server-loggarna.');
  }

  const sessionValue = sidCookie.split(';')[0];
  const tmpDir = path.resolve(path.join(__dirname, '../../.tmp'));
  await mkdir(tmpDir, { recursive: true });
  const cookiePath = path.join(tmpDir, 'cookies.txt');
  await writeFile(cookiePath, `${sessionValue}\n`, 'utf8');

  process.stdout.write(`Admin bootstrap klar för ${email}.\n`);
  process.stdout.write(`Cookie sparad till ${cookiePath}.\n`);
  if (bodyText) {
    process.stdout.write(`${bodyText}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exitCode = 1;
});
