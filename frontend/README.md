# SkolApp Frontend

React Native (Expo) appen använder cookie-baserade sessioner och RBAC från backend.

## Miljövariabler

Skapa en `.env` eller använd `.env.example` som mall:

```
EXPO_PUBLIC_API_URL=http://localhost:3333
```

Alla API-anrop görs med `withCredentials=true`, så backend måste tillåta CORS med credentials.

## Köra lokalt

```bash
cd frontend
npm install
npm start
```

Expo CLI visar hur du kör i simulator eller på webben.

## Auth-flöde

1. Vid appstart hämtas `GET /auth/whoami` för att avgöra session.
2. Utan session visas inloggning med magic link (och valfri dev-token om `PILOT_RETURN_TOKEN=true`).
3. `POST /auth/magic/verify` sätter cookie på servern → AuthContext refetchar whoami.
4. Gated vyer (Admin, händelsehantering) visas endast för roller `teacher`/`admin`.
5. `POST /auth/logout` rensar session och återgår till login.

## Tester

Frontend använder Jest + React Native Testing Library:

```bash
npm test
```

Tester mockar API-klienten och täcker bootstrap, login, roll-gating och logout.
