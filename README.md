# SkolApp – Drop‑In Agent Pack (v0.4.1)

Detta paket är **redo att dras in i GitHub** (Upload files → Commit). Det lägger till:
- 15 bygg/test‑agenter (GitHub Actions + mallar)
- UI‑testagent som tar screenshots och bygger **PowerPoint‑rapport**
- Mallar för ADR, feature‑spec, PR‑checklista, Telemetry & GDPR
- Script för att bygga SUPERZIP på release‑tagg

## Snabbstart
1) Ladda upp allt i repo‑roten (`Upload files` i GitHub).
2) Öppna en PR → `CI` och `Security` körs automatiskt.
3) Actions → **UI Test Report** → `Run workflow` → ange din publika URL (Vercel/GitHub Pages).
   - Artifacts: `UI_Test_Report.pptx` + Playwright HTML‑rapport.
4) Skapa release: `git tag v0.4.2 && git push --tags` → SUPERZIP skapas i GitHub Releases.

## Pilot Launch Kit (dev/stage/prod)

### Miljövariabler & secrets
- **GitHub Secrets** (Actions → Repository secrets):

  | Secret | Värdekälla |
  | --- | --- |
  | `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
  | `SUPABASE_SERVICE_ROLE` | Supabase → Project Settings → API → Service role key |
  | `SESSION_SECRET` | Generera 32+ tecken slumpsträng (t.ex. `openssl rand -hex 32`) |
  | `SESSION_TTL_DAYS` | `30` (justera vid behov) |
  | `ADMIN_BOOTSTRAP_TOKEN` | Engångshemlighet i 1Password/Secrets Manager |
  | `ADMIN_API_KEY` | Server-API-nyckel i 1Password/Secrets Manager |
  | `API_BASE_URL` | Publik URL till deployad backend (t.ex. `https://api.pilot.skolapp.se`) |
  | `SMOKE_ADMIN_EMAIL` | Den e-post som ska bli första admin (t.ex. `rektorn@school.se`) |
  | `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | SMTP-leverantör (Brevo, Postmark, etc) |
  | `SMTP_FROM` | Avsändaradress, t.ex. `SkolApp <no-reply@skolapp.se>` |
  | `CORS_ORIGINS` | `https://pilot.skolapp.se` (+ lokala ursprung vid behov) |
  | `PILOT_RETURN_TOKEN` | `false` i stage/prod |
  | `INVITE_RATE_LIMIT_PER_IP` | `10` |
  | `VERIFY_RATE_LIMIT_PER_IP` | `20` |
  | `METRICS_ENABLED` | `true` för stage/prod (exponera `/metrics`) |
  | `METRICS_DEFAULT_BUCKETS` | `0.01,0.05,0.1,0.3,1,3` (justera vid behov) |
  | `LOG_REDACT_FIELDS` | `body.password,body.token,headers.authorization` (lägg till egna) |
  | `METRICS_5XX_ALERT_THRESHOLD` | `5` (antal 5xx/min innan alert-hook triggas) |
  | `METRICS_RATELIMIT_ALERT_THRESHOLD` | `25` (antal 429/min innan alert-hook triggas) |

- **Vercel Environment Variables** (Production + Preview + Development):

  | Namn | Värde |
  | --- | --- |
  | `EXPO_PUBLIC_API_URL` | Samma värde som `API_BASE_URL` |
  | `SESSION_SECRET` | Samma som GitHub Secret |
  | `SESSION_TTL_DAYS` | `30` |
  | `CORS_ORIGINS` | `https://pilot.skolapp.se` (lägg till lokala ursprung i dev) |
  | `SUPABASE_URL` | Supabase Project URL |
  | `SUPABASE_SERVICE_ROLE` | Service role key |
  | `ADMIN_API_KEY` | Server-API-nyckel |
  | `PILOT_RETURN_TOKEN` | `false` i stage/prod, `true` endast lokalt |
  | `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP-konfiguration |
  | `INVITE_RATE_LIMIT_PER_IP` & `VERIFY_RATE_LIMIT_PER_IP` | Samma värden som i GitHub |

> Tips: Spegla secrets mellan GitHub & Vercel via 1Password/HashiCorp Vault så att samma värden används i CI, staging och prod.

### CLI-flöde (once per environment)
```bash
# Kör migreringar (idempotent)
npm run --workspace backend migrate:dev

# Skapa första admin och spara session-cookie
API_BASE_URL="https://api.pilot.skolapp.se" npx ts-node --esm backend/scripts/bootstrap-admin.ts --email rektorn@school.se

# Verifiera sessionen med cookie-filen
curl -b backend/.tmp/cookies.txt https://api.pilot.skolapp.se/auth/whoami

# Kör smoke-tests mot miljön
API_BASE_URL=https://api.pilot.skolapp.se npm run --workspace backend smoke
```

### Admin & invites
- CLI-scriptet `backend/scripts/bootstrap-admin.ts` använder `ADMIN_BOOTSTRAP_TOKEN` för att skapa första admin och lagrar cookien i `backend/.tmp/cookies.txt`.
- CSV-mall för inbjudningar finns i `backend/scripts/templates/invites.sample.csv` – ladda upp via `/admin/invitations` efter bootstrap.
- `backend/scripts/migrate.ts` kör alla `.sql`-filer i `backend/sql/` och loggar vilka som körs. Skriptet ignorerar säkra `already exists`-fel så det går att köra om.

### Smoke-tests & CI
- `backend/scripts/smoke.ts` kör en minimal E2E-checklista: `/health`, rate-limit headers, `whoami` utan/med cookie samt verifierar att `/metrics` ökar `auth_magic_initiate_total`.
- GitHub Actions-workflow `pilot.yml` kör `npm run migrate:dev`, `npm test`, `npm run smoke` efter deploy. Workflowen bootstrappas automatiskt med `SMOKE_ADMIN_EMAIL` för att säkra cookie innan smoke-testet.
- Workflow inkluderar gitleaks-scan (från `security.yml`) som tidigare för att säkerställa att inga secrets läckt in i Git.

### Observability & logging
- Sätt `METRICS_ENABLED=true` för att exponera Prometheus-flödet på `/metrics` (text/plain). Standardmätare + app-specifika counters/histogram ingår.
- `/metrics/summary` kräver admin-roll och sammanfattar `requestsPerMinute`, `errorsPerMinute`, latens (p50/p95) samt RBAC/429-statistik. Admin UI:s Observability-flik läser samma data.
- Adminpanelen har nya flikar för **Observability** (hälsa, trafik, rate-limit, cron) och **Audit** (filtrering, paginering, export via API).
- Loggar skrivs med `pino` i JSON-format och innehåller `requestId`, route, status, user-id/roll. `fastify-request-id` propagerar `x-request-id` i svaren.
- Lägg till extra redaktionsfält via `LOG_REDACT_FIELDS` (kommaseparerade pathar). Token/authorization-fält maskeras som default.
- Cron-status finns via `/reminders/health` (`lastRunAt`, `lastSuccessAt`, `lastError`, `sent24h`). `cron_reminders_sent_total` uppdateras för Prometheus.
- Alert-hooks för 5xx och rate-limit loggar varningar när trösklarna (`METRICS_5XX_ALERT_THRESHOLD`, `METRICS_RATELIMIT_ALERT_THRESHOLD`) passeras.

### Pilot-konfiguration (backend)
- `SESSION_SECRET` – hemlig nyckel för att signera cookies (sätts till ett starkt värde i prod/test).
- `SESSION_TTL_DAYS` – antal dagar en session är giltig innan ny inloggning krävs (default `30`).
- `ADMIN_BOOTSTRAP_TOKEN` – används en gång för att skapa första admin via `/admin/bootstrap`.
- `ADMIN_API_KEY` – behövs för server/CLI-uppgraderingar via `/admin/promote`.
- `INVITE_RATE_LIMIT_PER_IP` & `VERIFY_RATE_LIMIT_PER_IP` – styr per-IP rate-limit för magic-link initiering/verifiering.
- `CORS_ORIGINS` – kommaseparerad lista med tillåtna ursprung (standard: `https://pilot.skolapp.se,http://localhost:19006`).
- `PILOT_RETURN_TOKEN` – sätt till `true` i lokal utveckling om du vill få tillbaka engångstoken i svaret från `/auth/magic/initiate`.
- `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE` – används av backend och migrations-scriptet.
- `GET /auth/whoami` – returnerar aktuell användare baserat på cookie (401 annars).
- `POST /auth/logout` – revokerar sessionen och rensar cookien.

### Frontend-konfiguration
- `EXPO_PUBLIC_API_URL` – bas-URL för API:t, se `frontend/.env.example`.
- Axios är förkonfigurerat med `withCredentials=true`; backend måste tillåta CORS med credentials.

### Köra auth-flödet lokalt
1. Kopiera `backend/.env.example` till `backend/.env` och fyll i minst `SUPABASE_*`, `SESSION_SECRET` och önskad `CORS_ORIGINS`.
2. (Valfritt) Sätt `PILOT_RETURN_TOKEN=true` för att få tillbaka magiska token direkt i API-svaret under utveckling.
3. Starta backend: `npm run --workspace backend dev`.
4. Starta frontend: `cd frontend && npm start` (Expo kör appen).
5. Initiera inloggning: `POST /auth/magic/initiate` med `{ "email": "du@example.com", "classCode": "3A" }` eller använd inloggningsskärmen.
6. Verifiera token: `POST /auth/magic/verify` med token → svaret innehåller användaren och sätter en `sid`-cookie.
7. AuthContext i appen hämtar `GET /auth/whoami` och visar tabs om sessionen är giltig.
8. Anropa skyddade endpoints (t.ex. `POST /admin/test-push`) med cookien – endast roller från databasen (`guardian/teacher/admin`) släpps igenom.
9. Logga ut genom `POST /auth/logout` eller logout-knappen i appen för att rensa sessionen och cookien.

## Mappar
- `.github/workflows/` – agenter (CI, Security, Triage, Release, UI Test)  
- `agents/` – 15 agentmallar (för policy & rutiner)  
- `tests/` – UI‑test som bygger PPTX‑rapport
- `scripts/` – `package_superzip.mjs` och CLI (`scripts/admin/promote-user.ts`)
- `docs/` – mallar (ADR, Feature Spec, Telemetry, GDPR, PR)

> Ändra gärna `README.md` efter dina behov. Inga hemligheter ska checkas in – använd **GitHub Secrets**.
