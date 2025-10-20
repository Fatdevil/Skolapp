# SkolApp Backend

Denna backend körs på Fastify och använder Supabase för persistens. Sessionslagring sker med säkra HTTP-only cookies.

## Miljövariabler

- `SESSION_SECRET` – krävs för att signera cookies.
- `ADMIN_BOOTSTRAP_TOKEN` – engångssecret för att skapa första admin via `/admin/bootstrap`.
- `ADMIN_API_KEY` – server-nyckel för CLI-anrop till `/admin/promote`.
- `SESSION_TTL_DAYS` – antal dagar en session lever.
- `CORS_ORIGINS` – kommaseparerad lista över tillåtna origins.
- `PILOT_RETURN_TOKEN` – sätt till `true` lokalt för att få tillbaka engångstoken från `/auth/magic/initiate`.
- `INVITE_RATE_LIMIT_PER_IP` – antal magiska invite-initieringar tillåtna per IP under 10 minuter (default 10).
- `VERIFY_RATE_LIMIT_PER_IP` – antal verifieringar per IP under 10 minuter (default 20).

## Auth & admin-endpoints

- `POST /auth/magic/initiate` – starta magic-link (per-IP rate-limit baserat på `INVITE_RATE_LIMIT_PER_IP`).
- `POST /auth/magic/verify` – verifiera token, uppgradera roll enligt inbjudan och skapa session (per-IP rate-limit baserat på `VERIFY_RATE_LIMIT_PER_IP`).
- `GET /auth/whoami` – returnerar `{ user: { id, email, role } }` utifrån cookie. Svarar `401` utan session.
- `POST /auth/logout` – revokerar sessionen och tömmer cookien.
- `POST /admin/bootstrap` – skapar första admin när ingen admin finns (kräver `ADMIN_BOOTSTRAP_TOKEN`).
- `POST /admin/promote` – uppgraderar befintlig användares roll (kräver admin-session eller `x-admin-api-key`).
- `POST /admin/invitations` – importera CSV med kolumnerna `email,classCode[,role]`.
- Övriga `POST /admin/*`-endpoints har striktare rate-limits (30/minut per IP + sessionscookie) och audit-loggas.

Alla känsliga åtgärder (bootstrap, promote, verify) loggas i tabellen `audit_logs`. Alla cookies sätts med `HttpOnly`, `SameSite=Lax` och `Secure` (i produktion).

## Tester

```bash
npm install
npm run --workspace backend test --
```

## Lokalt flöde

1. Starta backend: `npm run --workspace backend dev`.
2. Kör SQL-migrationerna under `backend/sql` mot databasen.
3. Skapa första admin genom `POST /admin/bootstrap` med `secret=ADMIN_BOOTSTRAP_TOKEN`.
4. Skicka `POST /auth/magic/initiate` med e-post, klasskod och bjud in med `role` via CSV vid behov.
5. Verifiera via `POST /auth/magic/verify` – rollen uppgraderas automatiskt utifrån inbjudan.
6. Administratörer kan uppgradera andra via `POST /admin/promote` eller CLI-kommandot `npm run admin:promote -- --email=... --role=...`.
7. Hämta session via `GET /auth/whoami`.
8. Logga ut med `POST /auth/logout`.
