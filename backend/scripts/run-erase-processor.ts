import pino from 'pino';
import dotenv from 'dotenv';
import { processEraseQueue, processRetention } from '../src/jobs/eraseProcessor.js';

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

try {
  await processEraseQueue(logger);
  await processRetention(logger);
  logger.info('Privacy jobs completed');
} catch (error) {
  logger.error({ err: error }, 'Privacy job failed');
  process.exitCode = 1;
}
