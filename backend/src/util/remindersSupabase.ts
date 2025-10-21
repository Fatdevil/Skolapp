import cron from 'node-cron';
import { getSupabase } from '../db/supabase.js';
import { sendPush } from '../services/PushService.js';
import { incrementCronRemindersSent, incrementSupabaseQueryErrors } from '../metrics.js';

type ReminderHealth = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  sent24h: number;
};

const sentHistory: number[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

const health: ReminderHealth = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  sent24h: 0
};

function pruneSent(now: number) {
  while (sentHistory.length > 0 && now - sentHistory[0]! > DAY_MS) {
    sentHistory.shift();
  }
  health.sent24h = sentHistory.length;
}

function recordSent(now: number) {
  sentHistory.push(now);
  pruneSent(now);
  incrementCronRemindersSent(1);
}

export function startReminderWorkerSupabase() {
  const sb = getSupabase();
  cron.schedule('* * * * *', async () => {
    const startedAt = new Date();
    health.lastRunAt = startedAt.toISOString();
    pruneSent(Date.now());
    let lastError: string | null = null;
    try {
      const { data: events, error } = await sb.from('events').select('*');
      if (error) {
        lastError = error.message ?? 'events_query_failed';
        incrementSupabaseQueryErrors();
        return;
      }
      for (const event of events ?? []) {
        const startTs = new Date(event.start).getTime();
        const now = Date.now();
        const t24 = startTs - DAY_MS;
        const t2 = startTs - 2 * 60 * 60 * 1000;
        const diff24 = Math.abs(now - t24);
        const diff2 = Math.abs(now - t2);
        if (diff24 > 30000 && diff2 > 30000) {
          continue;
        }
        const keySuffix = diff24 <= diff2 ? 't24' : 't2';
        const key = `event:${event.id}:${keySuffix}`;
        const { data: sent, error: sentError } = await sb
          .from('reminders_sent')
          .select('*')
          .eq('key', key)
          .limit(1);
        if (sentError) {
          lastError = sentError.message ?? 'reminders_query_failed';
          incrementSupabaseQueryErrors();
          break;
        }
        if (sent && sent.length > 0) {
          continue;
        }
        const insertResult = await sb.from('reminders_sent').insert({ key, created_at: new Date().toISOString() });
        if (insertResult.error) {
          lastError = insertResult.error.message ?? 'reminders_insert_failed';
          incrementSupabaseQueryErrors();
          continue;
        }
        const { data: devices, error: devicesError } = await sb
          .from('devices')
          .select('expo_token')
          .eq('class_id', event.class_id);
        if (devicesError) {
          lastError = devicesError.message ?? 'devices_query_failed';
          incrementSupabaseQueryErrors();
          continue;
        }
        const tokens = (devices ?? []).map((row: any) => row.expo_token);
        await sendPush(tokens, 'Påminnelse', `${event.title} – ${new Date(event.start).toLocaleString()}`);
        recordSent(now);
      }
      if (!lastError) {
        health.lastSuccessAt = new Date().toISOString();
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'reminder_worker_failed';
    } finally {
      if (lastError) {
        health.lastError = lastError;
      } else {
        health.lastError = null;
      }
    }
  });
}

export function getRemindersHealth() {
  return { ...health };
}
