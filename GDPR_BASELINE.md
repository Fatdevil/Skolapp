# GDPR Baseline – Pilot

Den här baselinen beskriver hur piloten uppfyller grundläggande GDPR-krav för export, radering, samtycke, kryptering, retention och observation.

## Dataflöden

| Domän | Tabell | Kommentar |
| --- | --- | --- |
| Användare | `users` | Lagrar konto, roll, samtycke (`privacy_consent_version`, `privacy_consent_at`) och eventuell raderingsflagga (`erase_requested_at`, `deleted`). |
| Enheter | `devices` | Expo push-tokens krypteras (AES-256-GCM) och lagras i fälten `expo_token`, `expo_token_iv`, `expo_token_tag` kopplat till `user_id`. |
| Meddelanden | `messages` | Soft-delete via `deleted_at`; retention-jobbet markerar och redigerar äldre poster. |
| Händelser | `events` | Soft-delete via `deleted_at`, samt spårning av `created_by` för radering. |
| Audit | `audit_logs` | Loggar samtycke, export, erase-request, erase-processed och retention. |
| Erase-kö | `gdpr_erase_queue` | En rad per begäran med `forced`-flagga för manuella körningar. |

Exportformatet (`POST /privacy/export`) returnerar JSON med följande struktur:

```json
{
  "generatedAt": "2025-01-01T12:00:00.000Z",
  "userId": "user-123",
  "policyVersion": 1,
  "data": {
    "user": {...},
    "devices": [{ "id": "...", "classId": "...", "pushTokenMasked": "***abcd" }],
    "messages": [...],
    "events": [...],
    "auditLogs": [...]
  }
}
```

## Erase-strategi

1. `POST /privacy/erase` loggar audit (`privacy_erase_requested`), markerar `users.erase_requested_at` och lägger rad i `gdpr_erase_queue`.
2. Jobbet (`backend/src/jobs/eraseProcessor.ts`) körs varje timme via `node-cron`:
   - `messages`: `text='[redacted]'`, `deleted_at=now()`.
   - `events`: `title='[redacted]'`, `description=''`, `deleted_at=now()`.
   - `devices`: raderar poster för användaren.
   - `users`: anonymiserar e-post (`deleted-<id>@erased.local`), nollar samtyckesfält, sätter `deleted=true`.
   - `gdpr_erase_queue`: `processed_at=now()`.
   - Audit (`privacy_erase_processed`) + Prometheus-counter `privacy_erase_processed_total`.
3. Admin kan forcera via `POST /privacy/erase/force` (sätter `forced=true`).

## Retentionpolicy

- `RETENTION_DAYS_MESSAGES` (default 365) styr när meddelanden soft-deletas.
- Jobbet använder `applyMessageRetention` och loggar `privacy_retention_messages` samt uppdaterar counter `retention_messages_deleted_total`.
- Sätt värdet till `0` i testmiljö för att verifiera omedelbar städning.

## Kryptering

- `PII_ENC_KEY` (32 bytes base64) används i `util/crypto.ts`.
- AES-256-GCM: token -> `{ ct, iv, tag }`, lagras i `devices`.
- Dekryptering sker endast i minnet när push ska skickas (`getClassTokens`).
- Nyckelrotation: generera nyckel, uppdatera env, deploya, låt klienter registrera push igen (nya tokens lagras med nya nyckeln).

## Policy & samtycke

- `docs/privacy_policy.md` exponeras via `GET /privacy/policy`.
- `PRIVACY_POLICY_VERSION` versionerar policyn och sparas på användaren vid `POST /privacy/consent`.
- Mobilappen visar `PrivacyConsentScreen` tills `privacyConsentAt` finns.

## Hur körs erase-jobb manuellt?

```bash
# Kör en gång (läser backend/.env)
node --env-file backend/.env backend/scripts/run-erase-processor.ts
```

## Kända begränsningar

- Dataexport levereras som JSON via API:t. Ingen fil lagras server-side.
- Retention gäller endast meddelanden i piloten (events behålls tills erase).
- Push-token rotation kräver att klienterna registrerar sig på nytt efter nyckelbyte.
- Erase-jobbet körs batchvis varje timme; manuellt tvångskörning behövs för omedelbar radering i dev/stage.
