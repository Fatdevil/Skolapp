# Green Gate Release Policy

The **Green Gate** workflow keeps the repository releasable by enforcing a full
stack of quality and security checks before merge. Every pull request to `main`
triggers the [`Green Gate` GitHub Actions workflow](../.github/workflows/green-gate.yml).
A PR can only be merged when every gate below passes.

## Required checks

| Stage | Command | Purpose |
| --- | --- | --- |
| Type safety | `npm run verify:types` | Runs TypeScript across backend and frontend workspaces. |
| Lint | `npm run verify:lint` | ESLint with security hardening for API and app code. |
| Tests | `npm run verify:tests` | Vitest (backend) and Jest (frontend) with coverage budgets (≥80% backend, ≥70% frontend). |
| Mutation | `npm run verify:mutation` | Stryker mutates RBAC/auth critical paths to verify test rigour. |
| Supply chain | `npm run verify:audit` | Runs OSV scanner and `npm audit --audit-level=high`. |
| API fuzzing | `npm run verify:api-fuzz` | Schemathesis hits the Fastify OpenAPI spec with negative/edge-case tests. |
| OWASP ZAP | `npm run verify:zap` | Baseline scan for regressions, ignoring only vetted informational alerts. |
| Performance | `npm run verify:perf` | Autocannon enforces p95 latency budgets for `/health`, `/auth/whoami`, `/admin/status`. |
| Database | `npm run verify:migrate` | Spins up PostgreSQL 15, replays every SQL migration twice to guarantee idempotency. |
| Licenses | `npm run verify:licenses` | Blocks any dependency whose license is not MIT/Apache/BSD/ISC. |
| SBOM & vuln scan | `npm run verify:sbom` | Generates `backend/SBOM.json` (CycloneDX) and scans it with Trivy. |
| Smoke | `npm run verify:smoke` | Runs the backend smoke probes.

Use `npm run verify:all` locally to execute the full suite.

## Local workflow

1. Install dependencies: `npm install` (workspaces pull backend & frontend packages).
2. Start the Fastify API for fuzzing and perf checks in another shell:
   ```bash
   npm exec --workspace backend -- tsx src/index.ts
   ```
3. Run either the whole gate or individual steps:
   ```bash
   npm run verify:all
   # or
   npm run verify:types
   npm run verify:lint
   # ... etc
   ```

All scripts rely on Docker for heavy tooling (PostgreSQL, Schemathesis, ZAP,
Trivy, OSV scanner). Ensure Docker is available locally. Database migrations use
credentials `postgres/postgres` against a temporary `skolapp` database.

## Failure triage

* **Type/lint/test/mutation:** fix the offending code or adjust tests. Coverage
  thresholds (80% backend, 70% frontend) are strict.
* **OSV / npm audit:** update or replace vulnerable dependencies. No suppressions
  are allowed.
* **Schemathesis / ZAP:** inspect generated reports under `backend/reports/` or
  `security/`. Reproduce locally to fix the failing endpoints.
* **Performance:** `backend/reports/perf-summary.json` lists the recorded p95
  latency. Optimise or loosen load (never increase budget without sign-off).
* **Migrations:** check `backend/sql/` for idempotency bugs. Scripts rerun in
  the same database to guarantee safe reruns.
* **Licenses:** see `reports/licenses.json` for blocked packages. Replace them
  or seek legal approval before adjusting the whitelist.
* **SBOM / Trivy:** inspect `backend/reports/trivy-report.json` for CVEs and
  address before retrying.

The workflow posts a PR comment summarising latency, coverage, CVEs, license
violations, and ZAP alerts. Only a completely green run is considered a "Go".
