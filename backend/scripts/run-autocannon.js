#!/usr/bin/env node
import autocannon from 'autocannon';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PORT = process.env.BACKEND_PORT ? Number(process.env.BACKEND_PORT) : 3333;
const HOST = process.env.BACKEND_HOST ?? 'http://127.0.0.1';

const budgets = [
  { path: '/health', p95: 200 },
  { path: '/auth/whoami', p95: 350 },
  { path: '/admin/status', p95: 500 }
];

async function runScenario({ path, p95 }) {
  const url = `${HOST}:${PORT}${path}`;
  console.log(`\n📈 Perf-test ${url} (p95 ≤ ${p95}ms)`);
  const result = await autocannon({
    url,
    duration: Number(process.env.PERF_DURATION ?? 60),
    connections: Number(process.env.PERF_CONNECTIONS ?? 50),
    headers: { Accept: 'application/json' }
  });
  const latencyP95 = Number(result.latency.p95 ?? 0);
  console.log(`p95=${latencyP95}ms`);
  if (latencyP95 > p95) {
    throw new Error(`Latency budget miss for ${path}: ${latencyP95}ms > ${p95}ms`);
  }
  return { path, p95: latencyP95 };
}

async function main() {
  const summaries = [];
  for (const budget of budgets) {
    // eslint-disable-next-line no-await-in-loop
    summaries.push(await runScenario(budget));
  }
  console.log('\nPerf summary:', summaries);
  const reportDir = resolve(process.cwd(), 'reports');
  await mkdir(reportDir, { recursive: true });
  const outputPath = resolve(reportDir, 'perf-summary.json');
  await writeFile(outputPath, JSON.stringify({ summaries }, null, 2));
  console.log(`Perf report saved to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
