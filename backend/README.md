# SkolApp Backend

Denna backend körs på Fastify och använder Supabase för persistens. Sessionslagring sker med säkra HTTP-only cookies.

## Miljövariabler

- `SESSION_SECRET` – krävs för att signera cookies.
- `SESSION_TTL_DAYS` – antal dagar en session lever.
- `CORS_ORIGINS` – kommaseparerad lista över tillåtna origins.
- `PILOT_RETURN_TOKEN` – sätt till `true` lokalt för att få tillbaka engångstoken från `/auth/magic/initiate`.

## Auth-endpoints

- `POST /auth/magic/initiate` – starta magic-link.
- `POST /auth/magic/verify` – verifiera token och skapa session.
- `GET /auth/whoami` – returnerar `{ user: { id, email, role } }` utifrån cookie. Svarar `401` utan session.
- `POST /auth/logout` – revokerar sessionen och tömmer cookien.

Alla cookies sätts med `HttpOnly`, `SameSite=Lax` och `Secure` (i produktion).

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
