# SkolApp Backend

Denna backend körs på Fastify och använder Supabase för persistens. Sessionslagring sker med säkra HTTP-only cookies.

## Miljövariabler

- `SESSION_SECRET` – krävs för att signera cookies.
- `SESSION_TTL_DAYS` – antal dagar en session lever.
- `ADMIN_BOOTSTRAP_TOKEN` – engångshemlighet som krävs för att skapa första administratören via `/admin/bootstrap`.
- `ADMIN_API_KEY` – server-nyckel som används av CLI eller automatisering för `/admin/promote`.
- `INVITE_RATE_LIMIT_PER_IP` – maximalt antal `/auth/magic/initiate` per IP (per 10 min, default 10).
- `VERIFY_RATE_LIMIT_PER_IP` – maximalt antal `/auth/magic/verify` per IP (per 10 min, default 20).
- `PII_ENC_KEY` – 32 bytes base64-kodad nyckel för AES-256-GCM (se script nedan för att generera).
- `PRIVACY_POLICY_VERSION` – version av aktuell privacy-policy (heltal, default `1`).
- `RETENTION_DAYS_MESSAGES` – antal dagar meddelanden sparas innan de soft-deletas (default `365`).
- `PRIVACY_EXPORT_RATE_PER_IP` – rate-limit per IP för `/privacy/export` (default `5`).
- `PRIVACY_ERASE_RATE_PER_IP` – rate-limit per IP för `/privacy/erase` (default `3`).

Generera en ny PII-nyckel med:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
- `CORS_ORIGINS` – kommaseparerad lista över tillåtna origins.
- `PILOT_RETURN_TOKEN` – sätt till `true` lokalt för att få tillbaka engångstoken från `/auth/magic/initiate`.

## Auth-endpoints

- `POST /auth/magic/initiate` – starta magic-link.
- `POST /auth/magic/verify` – verifiera token, uppgraderar användarrollen om inbjudan ger högre behörighet och loggar audit-event.
- `GET /auth/whoami` – returnerar `{ user: { id, email, role } }` utifrån cookie. Svarar `401` utan session.
- `POST /auth/logout` – revokerar sessionen och tömmer cookien.

Alla cookies sätts med `HttpOnly`, `SameSite=Lax` och `Secure` (i produktion).

## Admin-bootstrap & rollhantering

- `POST /admin/bootstrap` – får endast användas om databasen saknar administratör. Payloaden måste innehålla `secret` (eller `x-bootstrap-token`-header) som matchar `ADMIN_BOOTSTRAP_TOKEN`. Anropet skapar/uppgraderar användaren till `admin`, startar session och loggar audit-event `admin_bootstrap`.
- `GET /admin/status` – returnerar `{ hasAdmin, count }` utan att kräva session. Används av CLI/CI för att kontrollera om en administratör redan finns.
- `POST /admin/promote` – kräver antingen inloggad administratör eller `x-admin-api-key` som matchar `ADMIN_API_KEY`. Endpointen uppgraderar endast roller (guardian < teacher < admin) och loggar `promote_user` med metadata.
- `POST /admin/invitations` – accepterar en valfri kolumn `role`. Ogiltiga värden (`guardian|teacher|admin`) ger `400`.

CLI-skriptet `backend/scripts/bootstrap-admin.ts` använder `GET /admin/status` för att bli idempotent och kan köras säkert i varje pipeline utan att misslyckas när en administratör redan finns.

## Audit-loggar

Hjälparen `util/audit.ts` skriver känsliga händelser till tabellen `audit_logs`:

```
id BIGSERIAL PRIMARY KEY,
actor_user_id TEXT,
action TEXT NOT NULL,
target_user_id TEXT,
meta JSONB,
created_at TIMESTAMPTZ DEFAULT now()
```

Meta-fältet innehåller t.ex. `{ via: 'session', from: 'guardian', to: 'teacher' }` vid rolluppgraderingar.

## Per-route rate-limits

- `/auth/magic/initiate` – begränsas via `INVITE_RATE_LIMIT_PER_IP` per 10 minuter.
- `/auth/magic/verify` – begränsas via `VERIFY_RATE_LIMIT_PER_IP` per 10 minuter.
- Alla `/admin/*`-endpoints – 30 anrop/minut per kombination av IP + session-cookie/API-nyckel.

Övertramp loggas som `warn` i Fastify-loggen.

## CLI för promotion

I root-projektet finns `scripts/admin/promote-user.ts`. Körs enklast via NPM-scriptet:

```bash
ADMIN_API_KEY=... npm run admin:promote -- --email=teacher@example.com --role=teacher
```

Scriptet använder API-nyckeln och skriver ut vilken roll användaren fick efter uppgraderingen.

## Tester

```bash
npm install
npm run --workspace backend test --
```

## Lokalt flöde

1. Starta backend: `npm run --workspace backend dev`.
2. Skicka `POST /auth/magic/initiate` med e-post & klasskod.
3. Verifiera via `POST /auth/magic/verify` och använd cookien för skyddade endpoints.
4. Hämta session via `GET /auth/whoami`.
5. Logga ut med `POST /auth/logout`.
