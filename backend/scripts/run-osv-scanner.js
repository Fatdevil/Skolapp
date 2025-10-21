#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const workdir = resolve(__dirname, '..');
  const reportsDir = resolve(workdir, 'reports');
  await mkdir(reportsDir, { recursive: true });
  const args = [
    'run',
    '--rm',
    '-v',
    `${workdir}:/scan`,
    'gcr.io/osv-scanner/osv-scanner:latest',
    '--lockfile',
    '/scan/package-lock.json',
    '--format',
    'json',
    '--output',
    '/scan/reports/osv-report.json',
    '--exit-code',
    '1'
  ];

  console.log('> docker', args.join(' '));
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`osv-scanner exited with code ${code}`));
      }
    });
    child.on('error', rejectPromise);
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
