import { vi } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'http://localhost:19006';
process.env.PILOT_RETURN_TOKEN = 'true';

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
