import Fastify from 'fastify';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { encryptPII, decryptPII, serializeEncryptedPII } from '../src/util/crypto.js';
import { registerPrivacyRoutes } from '../src/routes/privacy.js';
import * as session from '../src/auth/session.js';
import { processEraseQueue, processRetention } from '../src/jobs/eraseProcessor.js';
vi.mock('../src/repos/privacyRepo.js', () => ({
  collectUserExport: vi.fn(),
  enqueueEraseRequest: vi.fn(),
  listPendingEraseRequests: vi.fn(),
  markEraseProcessed: vi.fn()
}));
vi.mock('../src/repos/usersRepo.js', () => ({
  updatePrivacyConsent: vi.fn(),
  markEraseRequested: vi.fn(),
  getUserById: vi.fn(),
  anonymiseUser: vi.fn()
}));
vi.mock('../src/repos/messagesRepo.js', () => ({
  redactMessagesForUser: vi.fn(),
  applyMessageRetention: vi.fn()
}));
vi.mock('../src/repos/eventsRepo.js', () => ({
  redactEventsForUser: vi.fn()
}));
vi.mock('../src/repos/devicesRepo.js', () => ({
  deleteDevicesForUser: vi.fn()
}));
vi.mock('../src/util/audit.js', () => ({
  audit: vi.fn()
}));
vi.mock('../src/metrics.js', () => ({
  incrementPrivacyExport: vi.fn(),
  incrementPrivacyEraseRequested: vi.fn(),
  incrementPrivacyEraseProcessed: vi.fn(),
  incrementRetentionMessagesDeleted: vi.fn()
}));

import * as privacyRepoModule from '../src/repos/privacyRepo.js';
import * as usersRepoModule from '../src/repos/usersRepo.js';
import * as messagesRepoModule from '../src/repos/messagesRepo.js';
import * as eventsRepoModule from '../src/repos/eventsRepo.js';
import * as devicesRepoModule from '../src/repos/devicesRepo.js';
import * as auditModule from '../src/util/audit.js';
import * as metricsModule from '../src/metrics.js';

const mockedPrivacyRepo = vi.mocked(privacyRepoModule);
const mockedUsersRepo = vi.mocked(usersRepoModule);
const mockedMessagesRepo = vi.mocked(messagesRepoModule);
const mockedEventsRepo = vi.mocked(eventsRepoModule);
const mockedDevicesRepo = vi.mocked(devicesRepoModule);
const mockedAudit = vi.mocked(auditModule);
const mockedMetrics = vi.mocked(metricsModule);

describe('crypto helpers', () => {
  it('encrypts and decrypts PII roundtrip', () => {
    const cipher = encryptPII('secret-token');
    const serialized = serializeEncryptedPII(cipher);
    const plain = decryptPII(serialized);
    expect(plain).toBe('secret-token');
  });
});

describe('privacy routes', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await registerPrivacyRoutes(app, { exportRateLimit: 10, eraseRateLimit: 5 });
  });

  afterEach(async () => {
    await app.close();
  });

  it('stores consent with audit log', async () => {
    vi.spyOn(session, 'getUserFromRequest').mockResolvedValue({ id: 'user-1', email: 'u@example.com' } as any);
    mockedUsersRepo.updatePrivacyConsent.mockResolvedValue({
      privacy_consent_version: 2,
      privacy_consent_at: '2025-01-01T12:00:00Z'
    } as any);
    const response = await app.inject({
      method: 'POST',
      url: '/privacy/consent',
      payload: { version: 2 }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      consent: { version: 2, at: '2025-01-01T12:00:00Z' }
    });
    expect(mockedUsersRepo.updatePrivacyConsent).toHaveBeenCalledWith('user-1', 2);
    expect(mockedAudit.audit).toHaveBeenCalledWith('privacy_consent', { version: 2 }, 'user-1', 'user-1');
  });

  it('returns export payload as attachment and logs audit', async () => {
    vi.spyOn(session, 'getUserFromRequest').mockResolvedValue({ id: 'user-42', email: 'u@example.com' } as any);
    mockedPrivacyRepo.collectUserExport.mockResolvedValue({ user: { id: 'user-42' } } as any);
    const response = await app.inject({ method: 'POST', url: '/privacy/export' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('export-user-42');
    expect(mockedPrivacyRepo.collectUserExport).toHaveBeenCalledWith('user-42');
    expect(mockedAudit.audit).toHaveBeenCalledWith(expect.stringMatching('privacy_export'), expect.any(Object), 'user-42', 'user-42');
    expect(mockedMetrics.incrementPrivacyExport).toHaveBeenCalled();
  });

  it('queues erase request and marks requested', async () => {
    vi.spyOn(session, 'getUserFromRequest').mockResolvedValue({ id: 'user-2', email: 'u@example.com' } as any);
    mockedPrivacyRepo.enqueueEraseRequest.mockResolvedValue({ id: 99 } as any);
    const response = await app.inject({ method: 'POST', url: '/privacy/erase' });
    expect(response.statusCode).toBe(200);
    expect(mockedPrivacyRepo.enqueueEraseRequest).toHaveBeenCalledWith('user-2', false);
    expect(mockedUsersRepo.markEraseRequested).toHaveBeenCalledWith('user-2');
    expect(mockedMetrics.incrementPrivacyEraseRequested).toHaveBeenCalled();
  });
});

describe('erase processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes erase queue items', async () => {
    mockedPrivacyRepo.listPendingEraseRequests.mockResolvedValue([
      { id: 1, user_id: 'user-1', forced: false }
    ] as any);
    mockedMessagesRepo.redactMessagesForUser.mockResolvedValue(2);
    mockedEventsRepo.redactEventsForUser.mockResolvedValue(1);
    mockedDevicesRepo.deleteDevicesForUser.mockResolvedValue(3);
    mockedUsersRepo.anonymiseUser.mockResolvedValue();
    mockedPrivacyRepo.markEraseProcessed.mockResolvedValue();

    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger } as any;
    await processEraseQueue(logger);

    expect(mockedMessagesRepo.redactMessagesForUser).toHaveBeenCalledWith('user-1');
    expect(mockedPrivacyRepo.markEraseProcessed).toHaveBeenCalledWith(1);
    expect(mockedMetrics.incrementPrivacyEraseProcessed).toHaveBeenCalled();
    expect(mockedAudit.audit).toHaveBeenCalledWith(
      'privacy_erase_processed',
      expect.objectContaining({ queueId: 1 }),
      null,
      'user-1'
    );
  });

  it('runs retention cleanup', async () => {
    mockedMessagesRepo.applyMessageRetention.mockResolvedValue(5);
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger } as any;
    process.env.RETENTION_DAYS_MESSAGES = '0';
    await processRetention(logger);
    expect(mockedMessagesRepo.applyMessageRetention).toHaveBeenCalled();
    expect(mockedMetrics.incrementRetentionMessagesDeleted).toHaveBeenCalledWith(5);
    expect(mockedAudit.audit).toHaveBeenCalledWith(
      'privacy_retention_messages',
      expect.objectContaining({ deleted: 5 }),
      null,
      null
    );
  });
});
