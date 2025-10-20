# Pilot Runbook

1. Sätt miljövariablerna `ADMIN_BOOTSTRAP_TOKEN`, `ADMIN_API_KEY`, `SESSION_SECRET`, SMTP-inställningar och `CORS_ORIGINS` i backend-miljön (t.ex. Supabase Edge Functions).
2. Kör SQL-migrationerna i `backend/sql/` mot databasen för att få kolumnen `invitations.role` och tabellen `audit_logs`.
3. Skapa första administratören genom `POST /admin/bootstrap` med `{ "email": "rektorn@example.com", "secret": ADMIN_BOOTSTRAP_TOKEN }` eller header `x-bootstrap-token`.
4. Ladda upp CSV med `email,classCode,role` via `POST /admin/invitations` eller Admin-gränssnittet. Rollkolumnen accepterar `guardian`, `teacher` eller `admin` (default `guardian`).
5. Låt mottagarna verifiera sina länkar (`/auth/magic/verify`) – lärarroller kan nu skapa/radera events medan vårdnadshavare har läsbehörighet.
6. Övervaka tabellen `audit_logs` och Pino-loggar (rate-limit-varningar) för att upptäcka missbruk eller felaktiga rolländringar.
