#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const PORT = process.env.BACKEND_PORT ? Number(process.env.BACKEND_PORT) : 3333;
const TARGET = process.env.ZAP_TARGET ?? `http://127.0.0.1:${PORT}`;
const workspace = resolve('security');
const reportJson = 'zap-baseline-report.json';
const warnFile = 'zap-baseline-warn.md';
const configFile = 'zap-baseline.conf';

async function main() {
  const args = [
    'run',
    '--rm',
    '--network',
    'host',
    '-v',
    `${workspace}:/zap/wrk`,
    'owasp/zap2docker-stable',
    'zap-baseline.py',
    '-t',
    TARGET,
    '-c',
    `/zap/wrk/${configFile}`,
    '-J',
    `/zap/wrk/${reportJson}`,
    '-w',
    `/zap/wrk/${warnFile}`,
    '-I'
  ];

  console.log('> docker', args.join(' '));
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', args, { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`ZAP baseline exited with code ${code}`));
      }
    });
    child.on('error', rejectPromise);
  });
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
