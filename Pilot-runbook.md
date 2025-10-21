# Pilot-runbook – SkolApp säker uppstart

1. **Sätt miljövariabler**
   - `ADMIN_BOOTSTRAP_TOKEN`, `ADMIN_API_KEY`, `SESSION_SECRET`, `SMTP_*`, `CORS_ORIGINS` samt Supabase-nycklar (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
   - Konfigurera även `INVITE_RATE_LIMIT_PER_IP` och `VERIFY_RATE_LIMIT_PER_IP` vid behov (default 10/20 per IP & 10 minuter).

2. **Kör databas-migrationer**
   - `psql` eller Supabase CLI: applicera `backend/sql/*.sql` i ordningsföljd för att få `invitations.role`, `audit_logs` och sessions-tabeller.

3. **Bootstrapa första administratören**
   - Anropa `POST /admin/bootstrap` med `{ "email": "rektorn@example.com", "secret": "<ADMIN_BOOTSTRAP_TOKEN>" }`.
   - Kontrollera att svaret sätter cookie och att en rad i `audit_logs` (`action = 'admin_bootstrap'`) skapas.

4. **Importera användare via CSV**
   - Ladda upp fil i `/admin/invitations` eller via frontenden med kolumnerna `email,classCode,role`.
   - Tillåtna roller: `guardian`, `teacher`, `admin`. Roll lagras på inbjudan och styr uppgraderingen vid verifiering.

5. **Verifiera rättigheter i appen**
   - Låt en lärare verifiera sin magiska länk och säkerställ att rollen uppgraderas (kan skapa/radera event).
   - Låt en vårdnadshavare logga in och bekräfta att event-borttagning inte är tillgänglig.

6. **Övervaka loggar & rate-limits**
   - Följ tabellen `audit_logs` för bootstrap/promotion/verify-händelser.
   - Håll koll på Fastify-loggar (`warn`) för rate-limit-träffar på `/auth/magic/*` och `/admin/*`.
