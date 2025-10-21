import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { listPendingEraseRequests, markEraseProcessed } from '../repos/privacyRepo.js';
import { redactMessagesForUser, applyMessageRetention } from '../repos/messagesRepo.js';
import { redactEventsForUser } from '../repos/eventsRepo.js';
import { deleteDevicesForUser } from '../repos/devicesRepo.js';
import { anonymiseUser } from '../repos/usersRepo.js';
import { audit } from '../util/audit.js';
import {
  incrementPrivacyEraseProcessed,
  incrementRetentionMessagesDeleted
} from '../metrics.js';

const HOURLY_CRON = '0 * * * *';
const DAY_MS = 24 * 60 * 60 * 1000;

function getRetentionDays(): number {
  const raw = Number(process.env.RETENTION_DAYS_MESSAGES);
  if (!Number.isFinite(raw)) return 365;
  return raw;
}

export async function processEraseQueue(logger: FastifyBaseLogger) {
  const pending = await listPendingEraseRequests();
  for (const entry of pending) {
    try {
      const messages = await redactMessagesForUser(entry.user_id);
      const events = await redactEventsForUser(entry.user_id);
      const devices = await deleteDevicesForUser(entry.user_id);
      await anonymiseUser(entry.user_id);
      await markEraseProcessed(entry.id);
      await audit(
        'privacy_erase_processed',
        {
          queueId: entry.id,
          forced: entry.forced,
          messages,
          events,
          devices
        },
        null,
        entry.user_id
      );
      incrementPrivacyEraseProcessed();
    } catch (error) {
      logger.error({ err: error, queueId: entry.id }, 'privacy.erase.failed');
    }
  }
}

export async function processRetention(logger: FastifyBaseLogger) {
  const retentionDays = getRetentionDays();
  if (retentionDays < 0) return;
  const threshold = new Date(Date.now() - retentionDays * DAY_MS).toISOString();
  try {
    const deleted = await applyMessageRetention(threshold);
    if (deleted > 0) {
      incrementRetentionMessagesDeleted(deleted);
      await audit('privacy_retention_messages', { deleted, threshold }, null, null);
      logger.info({ deleted, threshold }, 'privacy.retention.messages');
    }
  } catch (error) {
    logger.error({ err: error }, 'privacy.retention.failed');
  }
}

export function startEraseProcessor(logger: FastifyBaseLogger) {
  cron.schedule(HOURLY_CRON, async () => {
    await processEraseQueue(logger);
    await processRetention(logger);
  });
}
