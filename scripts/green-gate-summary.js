#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return null;
  }
}

function formatCoverage(summary) {
  if (!summary || !summary.total) return 'n/a';
  const total = summary.total;
  return `${total.lines.pct ?? 0}% lines / ${total.statements.pct ?? 0}% statements`;
}

function extractPerf(perf) {
  if (!perf || !perf.summaries) return [];
  return perf.summaries.map((item) => ({ path: item.path, p95: item.p95 }));
}

function extractOsv(osv) {
  if (!osv || !Array.isArray(osv.results)) return [];
  const findings = [];
  for (const result of osv.results) {
    if (!result.vulnerabilities) continue;
    for (const vuln of result.vulnerabilities) {
      findings.push({ id: vuln.id, severity: vuln.severity, package: result.package?.name });
    }
  }
  return findings;
}

function extractTrivy(trivy) {
  if (!trivy || !Array.isArray(trivy.Results)) return [];
  const findings = [];
  for (const res of trivy.Results) {
    if (!Array.isArray(res.Vulnerabilities)) continue;
    for (const vuln of res.Vulnerabilities) {
      findings.push({ id: vuln.VulnerabilityID, severity: vuln.Severity, pkg: vuln.PkgName });
    }
  }
  return findings;
}

function extractZap(zap) {
  if (!zap || !Array.isArray(zap.site)) return [];
  const alerts = [];
  for (const site of zap.site) {
    if (!Array.isArray(site.alerts)) continue;
    for (const alert of site.alerts) {
      alerts.push({ name: alert.name, risk: alert.riskcode, url: alert.url });
    }
  }
  return alerts;
}

async function main() {
  const backendCoverage = await readJson(resolve('backend/coverage/coverage-summary.json'));
  const frontendCoverage = await readJson(resolve('frontend/coverage/coverage-summary.json'));
  const perf = await readJson(resolve('backend/reports/perf-summary.json'));
  const osv = await readJson(resolve('backend/reports/osv-report.json'));
  const trivy = await readJson(resolve('backend/reports/trivy-report.json'));
  const licenses = await readJson(resolve('reports/licenses.json'));
  const zap = await readJson(resolve('security/zap-baseline-report.json'));

  const lines = [];
  lines.push('### Green Gate Summary');
  lines.push('');
  const perfRows = extractPerf(perf);
  if (perfRows.length > 0) {
    lines.push('| Endpoint | p95 (ms) |');
    lines.push('| --- | ---: |');
    for (const row of perfRows) {
      lines.push(`| ${row.path} | ${row.p95} |`);
    }
    lines.push('');
  } else {
    lines.push('Perf: inga data.');
    lines.push('');
  }

  lines.push(`Backend coverage: ${formatCoverage(backendCoverage)}`);
  lines.push(`Frontend coverage: ${formatCoverage(frontendCoverage)}`);
  lines.push('');

  const osvFindings = extractOsv(osv);
  lines.push(`OSV findings: ${osvFindings.length}`);
  if (osvFindings.length > 0) {
    for (const finding of osvFindings.slice(0, 10)) {
      lines.push(`- ${finding.id} (${finding.severity}) – ${finding.package}`);
    }
  }
  lines.push('');

  const trivyFindings = extractTrivy(trivy);
  lines.push(`Trivy HIGH/CRITICAL findings: ${trivyFindings.length}`);
  if (trivyFindings.length > 0) {
    for (const finding of trivyFindings.slice(0, 10)) {
      lines.push(`- ${finding.id} (${finding.severity}) – ${finding.pkg}`);
    }
  }
  lines.push('');

  const licenseViolations = licenses?.violations ?? [];
  lines.push(`License violations: ${licenseViolations.length}`);
  if (licenseViolations.length > 0) {
    for (const violation of licenseViolations) {
      lines.push(`- ${violation.name}: ${violation.license}`);
    }
  }
  lines.push('');

  const zapAlerts = extractZap(zap);
  lines.push(`ZAP alerts: ${zapAlerts.length}`);
  if (zapAlerts.length > 0) {
    for (const alert of zapAlerts.slice(0, 10)) {
      lines.push(`- ${alert.name} (risk: ${alert.risk}) – ${alert.url}`);
    }
  }

  const reportDir = resolve('reports');
  await mkdir(reportDir, { recursive: true });
  const summaryPath = resolve(reportDir, 'green-gate-summary.md');
  await writeFile(summaryPath, lines.join('\n'));
  console.log(lines.join('\n'));
}

main().catch((error) => {
  console.error('Failed to build Green Gate summary', error);
  process.exit(1);
});
