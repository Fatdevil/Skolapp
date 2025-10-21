import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import dotenv from 'dotenv';
import axios from 'axios';

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

async function persistCookie(setCookie: string[] | string | undefined) {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const sidCookie = cookies.find((cookie) => cookie.startsWith('sid='));
  if (!sidCookie) {
    throw new Error('Kunde inte hitta sid-cookie i svaret. Kontrollera server-loggarna.');
  }
  const sessionValue = sidCookie.split(';')[0];
  const tmpDir = path.resolve(path.join(__dirname, '../../.tmp'));
  await mkdir(tmpDir, { recursive: true });
  const cookiePath = path.join(tmpDir, 'cookies.txt');
  await writeFile(cookiePath, `${sessionValue}\n`, 'utf8');
  return cookiePath;
}

function normaliseResponseBody(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body);
  } catch (error) {
    return String(body);
  }
}

export async function main(): Promise<number> {
  const email = getArg('email') ?? process.env.SMOKE_ADMIN_EMAIL ?? null;
  if (!email) {
    throw new Error('Ange e-post med --email=example@domain.se eller sätt SMOKE_ADMIN_EMAIL.');
  }

  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3333';
  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

  if (!bootstrapToken) {
    throw new Error('ADMIN_BOOTSTRAP_TOKEN saknas – kan inte bootstrapa administratör.');
  }

  try {
    const { data } = await axios.get<{ hasAdmin?: boolean }>(`${apiBaseUrl}/admin/status`, {
      timeout: 10_000
    });
    if (data?.hasAdmin) {
      console.log('Admin already bootstrapped; skipping.');
      return 0;
    }
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const reason = status ?? (error as Error).message;
    console.warn('Status check failed, attempting bootstrap anyway…', reason);
  }

  const response = await axios.post(
    `${apiBaseUrl}/admin/bootstrap`,
    { email, secret: bootstrapToken },
    {
      timeout: 15_000,
      headers: {
        'Content-Type': 'application/json',
        'x-bootstrap-token': bootstrapToken
      },
      validateStatus: () => true
    }
  );

  if (response.status === 409) {
    console.log('Admin already bootstrapped (409); treating as success.');
    return 0;
  }

  if (response.status < 200 || response.status >= 300) {
    const body = normaliseResponseBody(response.data);
    throw new Error(`Bootstrap misslyckades (${response.status}): ${body || 'okänt fel'}`);
  }

  const cookiePath = await persistCookie(response.headers['set-cookie']);

  console.log(`Admin bootstrap klar för ${email}.`);
  console.log(`Cookie sparad till ${cookiePath}.`);
  const bodyText = normaliseResponseBody(response.data);
  if (bodyText) {
    console.log(bodyText);
  }

  return 0;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryUrl && import.meta.url === entryUrl) {
  main()
    .then((code) => {
      process.exit(code);
    })
    .catch((err) => {
      process.stderr.write(`${String(err)}\n`);
      process.exit(1);
    });
}
