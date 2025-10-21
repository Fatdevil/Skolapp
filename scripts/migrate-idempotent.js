#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const containerName = `skolapp-migrate-${Date.now()}`;
const sqlDir = resolve('backend/sql');

function runDocker(args, options = {}) {
  const stdio = options.stdio ?? 'inherit';
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', args, { ...options, stdio });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`docker ${args.join(' ')} exited with code ${code}`));
      }
    });
    child.on('error', rejectPromise);
  });
}

async function waitForPostgres() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await runDocker(['exec', containerName, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' });
      return;
    } catch (error) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
    }
  }
  throw new Error('Postgres readiness timed out');
}

async function applyMigrations() {
  const files = (await readdir(sqlDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) {
    const remotePath = `/migrations/${file}`;
    console.log(`Applying ${remotePath}`);
    await runDocker([
      'exec',
      containerName,
      'psql',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'skolapp',
      '-f',
      remotePath
    ]);
  }
}

async function main() {
  await runDocker([
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    '-e',
    'POSTGRES_PASSWORD=postgres',
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_DB=skolapp',
    '-v',
    `${sqlDir}:/migrations:ro`,
    'postgres:15'
  ]);

  try {
    await waitForPostgres();
    console.log('Postgres is ready, applying migrations (pass 1)');
    await applyMigrations();
    console.log('Re-applying migrations (pass 2)');
    await applyMigrations();
  } finally {
    await runDocker(['stop', containerName]).catch((error) => {
      console.warn('Failed to stop postgres container', error.message ?? error);
    });
  }
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  try {
    await runDocker(['stop', containerName]);
  } catch (stopError) {
    if (process.env.CI) {
      console.warn('Cleanup failed:', stopError.message ?? stopError);
    }
  }
  process.exit(1);
});
