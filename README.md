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

### Pilot-konfiguration (backend)
- `SESSION_SECRET` – hemlig nyckel för att signera cookies (sätts till ett starkt värde i prod/test).
- `SESSION_TTL_DAYS` – antal dagar en session är giltig innan ny inloggning krävs (default `30`).
- `CORS_ORIGINS` – kommaseparerad lista med tillåtna ursprung (standard: `http://localhost:19006,http://localhost:3000`).
- `PILOT_RETURN_TOKEN` – sätt till `true` i lokal utveckling om du vill få tillbaka engångstoken i svaret från `/auth/magic/initiate`.
- `ADMIN_BOOTSTRAP_TOKEN` – engångsnyckel för att skapa första admin via `POST /admin/bootstrap`.
- `ADMIN_API_KEY` – server-nyckel för CLI- och automatiska anrop till `POST /admin/promote`.
- `INVITE_RATE_LIMIT_PER_IP` / `VERIFY_RATE_LIMIT_PER_IP` – hårdare rate-limits (per IP) för magic-link-initiering respektive verifiering.
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
8. Anropa skyddade endpoints (t.ex. `POST /admin/test-push`) med cookien – endast roller från databasen (`guardian/teacher/admin`) släpps igenom. `POST /admin/promote` kan även skyddas med `x-admin-api-key`.
9. Logga ut genom `POST /auth/logout` eller logout-knappen i appen för att rensa sessionen och cookien.

### Säker admin-bootstrap & CLI
- Kör SQL-migrationerna i `backend/sql` för att få tabellerna `invitations.role` och `audit_logs`.
- Skapa första admin när databasen är tom: `POST /admin/bootstrap` med `{ email, secret: ADMIN_BOOTSTRAP_TOKEN }` eller header `x-bootstrap-token`.
- Använd CLI-skriptet `npm run admin:promote -- --email=teacher@example.com --role=admin` för att uppgradera roller via API-nyckel (`ADMIN_API_KEY`).
- Alla bootstrap-/promote-/verify-åtgärder loggas i tabellen `audit_logs`.

## Mappar
- `.github/workflows/` – agenter (CI, Security, Triage, Release, UI Test)  
- `agents/` – 15 agentmallar (för policy & rutiner)  
- `tests/` – UI‑test som bygger PPTX‑rapport  
- `scripts/` – `package_superzip.mjs`, `admin/promote-user.ts`
- `docs/` – mallar (ADR, Feature Spec, Telemetry, GDPR, PR)

> Ändra gärna `README.md` efter dina behov. Inga hemligheter ska checkas in – använd **GitHub Secrets**.
