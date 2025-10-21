#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const allowed = new Set([
  'mit',
  'apache-2.0',
  'apache license 2.0',
  'apache license version 2.0',
  'bsd-2-clause',
  'bsd-3-clause',
  'isc'
]);

async function getPackageLicense(pkgPath) {
  try {
    const pkgJson = await readFile(pkgPath, 'utf8');
    const parsed = JSON.parse(pkgJson);
    const { license } = parsed;
    if (!license) {
      return null;
    }
    if (typeof license === 'string') {
      return license.toLowerCase();
    }
    return JSON.stringify(license).toLowerCase();
  } catch (error) {
    return null;
  }
}

async function main() {
  const lockPath = resolve('package-lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  const packages = lock.packages ?? {};
  const violations = [];

  for (const [pkg, meta] of Object.entries(packages)) {
    if (!pkg || pkg === '') continue;
    if (meta.link) continue; // workspace link
    const fsPath = resolve(pkg);
    const pkgJsonPath = join(fsPath, 'package.json');
    const license = await getPackageLicense(pkgJsonPath);
    if (!license) {
      violations.push({ name: meta.name ?? pkg, license: 'unknown' });
      continue;
    }
    const licenseLower = license.toLowerCase();
    const isAllowed = Array.from(allowed).some((approved) => licenseLower.includes(approved));
    if (!isAllowed) {
      violations.push({ name: meta.name ?? pkg, license });
    }
  }

  const reportDir = resolve('reports');
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, 'licenses.json');
  await writeFile(reportPath, JSON.stringify({ violations }, null, 2));
  if (violations.length > 0) {
    console.error('License policy violations found:');
    for (const violation of violations) {
      console.error(` - ${violation.name}: ${violation.license}`);
    }
    process.exit(1);
  }
  console.log('All dependencies comply with license policy.');
}

main().catch((error) => {
  console.error('Failed to check licenses:', error.message ?? error);
  process.exit(1);
});
