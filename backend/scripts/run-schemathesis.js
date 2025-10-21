#!/usr/bin/env node
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.BACKEND_PORT ? Number(process.env.BACKEND_PORT) : 3333;
const SPEC_URL = process.env.SCHEMATHESIS_SPEC_URL ?? `http://127.0.0.1:${PORT}/documentation/json`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, '../schemathesis.config.json');
const backendRoot = resolve(__dirname, '..');
const reportsDir = resolve(backendRoot, 'reports');

async function main() {
  try {
    await readFile(configPath, 'utf8');
  } catch (error) {
    console.error('Schemathesis config saknas:', configPath);
    process.exit(1);
  }

  await mkdir(reportsDir, { recursive: true });

  const args = [
    'run',
    '--rm',
    '--network',
    'host',
    '-v',
    `${process.cwd()}:/work:ro`,
    '-v',
    `${reportsDir}:/reports`,
    '-w',
    '/work',
    'schemathesis/schemathesis:stable',
    'run',
    '--checks',
    'all',
    '-c',
    '/work/backend/schemathesis.config.json',
    '--request-timeout',
    '10',
    '--workers',
    '4',
    '--junit-xml',
    '/reports/schemathesis.xml',
    SPEC_URL
  ];

  console.log('> docker', args.join(' '));
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Schemathesis exited with code ${code}`));
      }
    });
    child.on('error', rejectPromise);
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
