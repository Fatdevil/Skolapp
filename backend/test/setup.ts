import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'http://localhost:19006';
process.env.PILOT_RETURN_TOKEN = 'false';
process.env.SESSION_SECRET = 'test-secret';
process.env.SESSION_TTL_DAYS = '30';
process.env.ADMIN_BOOTSTRAP_TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN ?? 'test-bootstrap-secret';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'test-admin-api-key';
process.env.API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3333';
process.env.METRICS_ENABLED = 'true';
process.env.METRICS_DEFAULT_BUCKETS = '0.01,0.05,0.1,0.3,1,3';
process.env.LOG_REDACT_FIELDS = 'body.password,body.token,headers.authorization';
if (!process.env.PII_ENC_KEY) {
  process.env.PII_ENC_KEY = randomBytes(32).toString('base64');
}
if (!process.env.PII_HASH_KEY) {
  process.env.PII_HASH_KEY = randomBytes(32).toString('base64');
}
process.env.PRIVACY_POLICY_VERSION = '1';
process.env.RETENTION_DAYS_MESSAGES = process.env.RETENTION_DAYS_MESSAGES ?? '365';
process.env.PRIVACY_EXPORT_RATE_PER_IP = process.env.PRIVACY_EXPORT_RATE_PER_IP ?? '5';
process.env.PRIVACY_ERASE_RATE_PER_IP = process.env.PRIVACY_ERASE_RATE_PER_IP ?? '3';

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
