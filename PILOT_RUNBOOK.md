# Pilot Launch Runbook

Den här runbooken beskriver hur piloten driftsätts end-to-end för dev/stage/prod.

## 1. Sätt secrets och env

### GitHub Secrets (repo → Settings → Secrets and variables → Actions)
| Secret | Värdekälla |
| --- | --- |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE` | Supabase → Project Settings → API → Service role key |
| `SESSION_SECRET` | Generera slumpad 32+ tecken sträng (`openssl rand -hex 32`) |
| `SESSION_TTL_DAYS` | `30` |
| `ADMIN_BOOTSTRAP_TOKEN` | Engångshemlighet i 1Password/Secrets Manager |
| `ADMIN_API_KEY` | Admin-API-nyckel (1Password/Secrets Manager) |
| `API_BASE_URL` | Publika backend-url: `https://api.pilot.skolapp.se` (stage/prod) |
| `SMOKE_ADMIN_EMAIL` | Första adminens e-post (t.ex. `rektorn@school.se`) |
| `CORS_ORIGINS` | `https://pilot.skolapp.se` (+ ev. localhost) |
| `PILOT_RETURN_TOKEN` | `false` |
| `INVITE_RATE_LIMIT_PER_IP` | `10` |
| `VERIFY_RATE_LIMIT_PER_IP` | `20` |
| `PII_ENC_KEY` | 32 bytes base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `PII_HASH_KEY` | Separat 32 bytes base64 för HMAC (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `PRIVACY_POLICY_VERSION` | `1` |
| `RETENTION_DAYS_MESSAGES` | `365` |
| `PRIVACY_EXPORT_RATE_PER_IP` | `5` |
| `PRIVACY_ERASE_RATE_PER_IP` | `3` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP-leverantör |
| `METRICS_ENABLED` | `true` (aktivera `/metrics`) |
| `METRICS_DEFAULT_BUCKETS` | `0.01,0.05,0.1,0.3,1,3` |
| `LOG_REDACT_FIELDS` | `body.password,body.token,headers.authorization` |
| `METRICS_5XX_ALERT_THRESHOLD` | `5` |
| `METRICS_RATELIMIT_ALERT_THRESHOLD` | `25` |

### Vercel Environment Variables (Production + Preview + Development)
| Namn | Värde |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Samma som `API_BASE_URL` |
| `SESSION_SECRET` | Samma som GitHub secret |
| `SESSION_TTL_DAYS` | `30` |
| `CORS_ORIGINS` | `https://pilot.skolapp.se` (lägg till lokala ursprung i dev) |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE` | Service role key |
| `ADMIN_API_KEY` | Admin API-nyckel |
| `PILOT_RETURN_TOKEN` | `false` (endast `true` lokalt) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP-konfiguration |
| `INVITE_RATE_LIMIT_PER_IP` / `VERIFY_RATE_LIMIT_PER_IP` | Samma värden som i GitHub |
| `PII_ENC_KEY` | Samma som GitHub secret |
| `PII_HASH_KEY` | Separat HMAC-nyckel (samma som GitHub secret) |
| `PRIVACY_POLICY_VERSION` | `1` |
| `RETENTION_DAYS_MESSAGES` | `365` |
| `PRIVACY_EXPORT_RATE_PER_IP` | `5` |
| `PRIVACY_ERASE_RATE_PER_IP` | `3` |
| `METRICS_ENABLED` | `true` |
| `METRICS_DEFAULT_BUCKETS` | `0.01,0.05,0.1,0.3,1,3` |
| `LOG_REDACT_FIELDS` | `body.password,body.token,headers.authorization` |

> Tips: Spegla värden via 1Password/Vault så att GitHub Actions och Vercel alltid ligger i synk.

## 2. Kör migrationer
```
npm run --workspace backend migrate:dev
```
Skriptet använder `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE` och loggar varje `.sql`-fil. Körs säkert flera gånger (ignorerar `already exists`).

## 3. Bootstrap admin
```
API_BASE_URL="https://api.pilot.skolapp.se" \
  npx ts-node --esm backend/scripts/bootstrap-admin.ts --email rektorn@school.se
```
- `ADMIN_BOOTSTRAP_TOKEN` måste vara satt i miljön.
- Skriptet anropar först `GET /admin/status` och avslutar direkt (exit code 0) om en administratör redan finns.
- Skriptet sparar cookie i `backend/.tmp/cookies.txt`.
- Förväntad output vid första körningen: `Admin bootstrap klar för …` + JSON-respons från API:t.
- Upprepade körningar returnerar `Admin already bootstrapped …` utan att orsaka fel i pipelinen.
- Manuell statuskontroll: `curl https://api.pilot.skolapp.se/admin/status` → `{ "hasAdmin": true, "count": 1 }`.

## 4. Ladda upp CSV med roller
- Använd mallen `backend/scripts/templates/invites.sample.csv` och fyll i riktiga adresser/klasskoder.
- Skicka filen till `/admin/invitations` (antingen via admin-UI eller `curl`).
- Endpoints kräver `ADMIN_API_KEY` eller en admin-session.

## 5. Stäng dev-läckor
- Sätt `PILOT_RETURN_TOKEN=false` i alla miljöer.
- Begränsa `CORS_ORIGINS` till `https://pilot.skolapp.se` + de lokala origins som verkligen behövs.
- Kontrollera att `BANKID_ENABLED` fortfarande är `false` om BankID inte ska vara aktivt.
- Säkerställ att privacy-variablerna (`PII_ENC_KEY`, `PRIVACY_POLICY_VERSION`, `RETENTION_DAYS_MESSAGES`, `PRIVACY_EXPORT_RATE_PER_IP`, `PRIVACY_ERASE_RATE_PER_IP`) är satta enligt pilotens policy.

## 6. Sanity-test
```
# Kontrollera aktuell session
curl -b backend/.tmp/cookies.txt https://api.pilot.skolapp.se/auth/whoami

# Uppgradera en användare (kräver ADMIN_API_KEY)
curl -X POST https://api.pilot.skolapp.se/admin/promote \
  -H "Content-Type: application/json" \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -d '{"email":"lärare@pilot.se","role":"teacher"}'

# Rate-limit check (ska ge 429 efter 10 snabba anrop)
for i in {1..11}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"smoke${i}@pilot.se\",\"classCode\":\"3B\"}" \
    https://api.pilot.skolapp.se/auth/magic/initiate;
done
```
- `whoami` ska svara `200` med `user.role`.
- `admin/promote` ska returnera `{ "ok": true }`.
- Sista raden i loopen ska returnera `429` och logga rate-limit i backend-loggarna.

## 7. Privacy smoke

```bash
# Hämta policy (ska visa version från PRIVACY_POLICY_VERSION)
curl https://api.pilot.skolapp.se/privacy/policy

# Begär export med autentiserad cookie (rate-limit styrs av PRIVACY_EXPORT_RATE_PER_IP)
curl -b backend/.tmp/cookies.txt -X POST https://api.pilot.skolapp.se/privacy/export -o export.json

# Begär radering (läggs i kö)
curl -b backend/.tmp/cookies.txt -X POST https://api.pilot.skolapp.se/privacy/erase

# (Dev) Kör erase-jobbet manuellt
node --env-file backend/.env backend/scripts/run-erase-processor.ts

# Roterar PII_ENC_KEY – generera ny nyckel och uppdatera secrets
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- Kontrollera att audit-loggen innehåller `privacy_export`, `privacy_erase_requested` och `privacy_erase_processed` efter körning.
- Vid nyckelrotation: uppdatera `PII_ENC_KEY` i GitHub + Vercel, deploya backend och kör `npm run --workspace backend migrate:dev` om nya krypterade kolumner tillkommit. Befintliga tokens kan roteras genom att klienterna registrerar sig igen.
- Sätt `RETENTION_DAYS_MESSAGES=0` i en temporär miljö för att validera att cron-jobbet soft-deletar gamla meddelanden.

## 8. Device index migration

1. Kör backfill i dry-run för att verifiera skriptet:
   ```
   npm run --workspace backend backfill:device-hash -- --dry-run
   ```
2. Kör backfill på riktigt och följ loggarna efter fel:
   ```
   npm run --workspace backend backfill:device-hash
   ```
   - Skriptet loggar hur många rader som uppdaterades och exit-kodar ≠0 om något misslyckas.
3. Deduplikera devices (börja med torrkörning):
   ```
   npm run --workspace backend dedupe:devices
   npm run --workspace backend dedupe:devices -- --apply
   ```
   - `devices_deduplicated_total`-metrisken ökar med antalet rader som tas bort.
4. Kör migrationen som lägger det unika indexet:
   ```
   npm run --workspace backend migrate:dev
   ```
5. Verifiera manuellt:
   - Registrera samma Expo-token två gånger och kontrollera att endast en rad finns kvar i `devices`.
   - Kontrollera att `last_seen_at` uppdateras och att `user_id` sätts när klienten loggar in.

Rollback: Droppa indexet om något låser sig (`drop index if exists devices_token_hash_uidx;`) och återläs backup om data gått förlorad.

## 9. Observability
- Kontrollera att `METRICS_ENABLED=true` i miljön och att `curl https://api.pilot.skolapp.se/metrics` returnerar text med `http_request_duration_seconds`.
- Efter ett `POST /auth/magic/initiate` ska `auth_magic_initiate_total` öka (se smoke-scriptet för referensflöde).
- `/metrics/summary` kräver admin-cookie: verifiera p50/p95-latens och `requestsPerMinute`. Administratörerna använder samma endpoint i Observability-fliken.
- Admin UI → Observability: kontrollera att API-health och Cron-health laddas. Audit-fliken ska visa senaste händelserna med filtrering.
- Supabase audit-loggar kan granskas direkt: `select * from audit_logs order by created_at desc limit 50;`
- API-loggar (JSON) finns i Vercel → Logs. Sök på `alert.triggered` för att se rate-limit/5xx hookar.
- Viktiga signaler: spikar i 5xx (tröskel från `METRICS_5XX_ALERT_THRESHOLD`), rate-limit warnings (`Rate limit exceeded`), `cron_reminders_sent_total` som ökar enligt schema.

## 10. Rollback
1. Återställ env:
   - Sätt tillbaka tidigare GitHub/Vercel-secrets om fel värde deployats.
   - Rulla tillbaka till föregående Vercel release (`Deployments → Promote previous`).
2. Databas:
   - Migreringarna är idempotenta; kör `npm run --workspace backend migrate:dev` igen (no-op om allt redan är applicerat).
   - För full rollback: använd Supabase point-in-time recovery eller återläs backup (kontakta DBA).
3. Bekräfta att smoke-tests passerar igen (`npm run --workspace backend smoke`).

---

**Kontakt:** Slack #pilot-support eller on-call enligt PagerDuty om något blockerar lanseringen.
