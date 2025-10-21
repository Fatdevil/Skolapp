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
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP-leverantör |

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

## 7. Observability
- Supabase audit-loggar: `select * from audit_logs order by created_at desc limit 50;`
- API-loggar: Vercel → Logs (Production/Preview) eller Supabase → Logs.
- Viktiga signaler: 4xx/5xx-spikar, rate-limit warnings (`Rate limit exceeded`).

## 8. Rollback
1. Återställ env:
   - Sätt tillbaka tidigare GitHub/Vercel-secrets om fel värde deployats.
   - Rulla tillbaka till föregående Vercel release (`Deployments → Promote previous`).
2. Databas:
   - Migreringarna är idempotenta; kör `npm run --workspace backend migrate:dev` igen (no-op om allt redan är applicerat).
   - För full rollback: använd Supabase point-in-time recovery eller återläs backup (kontakta DBA).
3. Bekräfta att smoke-tests passerar igen (`npm run --workspace backend smoke`).

---

**Kontakt:** Slack #pilot-support eller on-call enligt PagerDuty om något blockerar lanseringen.
