import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'http://localhost:19006';
process.env.PILOT_RETURN_TOKEN = 'false';
process.env.SESSION_SECRET = 'test-secret';
process.env.SESSION_TTL_DAYS = '30';
process.env.ADMIN_BOOTSTRAP_TOKEN = process.env.ADMIN_BOOTSTRAP_TOKEN ?? 'test-bootstrap-secret';
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? 'test-admin-api-key';
process.env.API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3333';

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
