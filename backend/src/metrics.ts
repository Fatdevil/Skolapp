import { Counter, Histogram, Registry, collectDefaultMetrics, type HistogramConfiguration } from 'prom-client';
import { triggerAlert } from './alerts.js';

type RequestSample = {
  timestamp: number;
  durationMs: number;
  statusCode: number;
};

const registry = new Registry();

function parseBuckets(): number[] | undefined {
  const env = process.env.METRICS_DEFAULT_BUCKETS;
  if (!env) return undefined;
  const buckets = env
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  return buckets.length > 0 ? buckets : undefined;
}

const histogramOptions: HistogramConfiguration<'method' | 'route' | 'status'> = {
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [registry]
};

const parsedBuckets = parseBuckets();
if (parsedBuckets) {
  histogramOptions.buckets = parsedBuckets;
}

const httpRequestDurationSeconds = new Histogram(histogramOptions);

const authMagicInitiateTotal = new Counter({
  name: 'auth_magic_initiate_total',
  help: 'Total number of magic link initiate calls',
  registers: [registry]
});

const authMagicVerifyTotal = new Counter({
  name: 'auth_magic_verify_total',
  help: 'Total number of magic link verify calls',
  registers: [registry]
});

const rbacForbiddenTotal = new Counter({
  name: 'rbac_forbidden_total',
  help: 'Total number of RBAC forbidden responses',
  registers: [registry]
});

const rateLimitHitTotal = new Counter({
  name: 'rate_limit_hit_total',
  help: 'Total number of rate limit hits',
  registers: [registry]
});

const emailSendTotal = new Counter({
  name: 'email_send_total',
  help: 'Total emails sent grouped by status',
  labelNames: ['status'] as const,
  registers: [registry]
});

const pushSendTotal = new Counter({
  name: 'push_send_total',
  help: 'Total push notifications sent grouped by status',
  labelNames: ['status'] as const,
  registers: [registry]
});

const cronRemindersSentTotal = new Counter({
  name: 'cron_reminders_sent_total',
  help: 'Total reminders sent from cron jobs',
  registers: [registry]
});

const privacyExportTotal = new Counter({
  name: 'privacy_export_total',
  help: 'Total privacy data exports',
  registers: [registry]
});

const privacyEraseRequestedTotal = new Counter({
  name: 'privacy_erase_requested_total',
  help: 'Total privacy erase requests',
  registers: [registry]
});

const privacyEraseProcessedTotal = new Counter({
  name: 'privacy_erase_processed_total',
  help: 'Total privacy erase requests processed',
  registers: [registry]
});

const retentionMessagesDeletedTotal = new Counter({
  name: 'retention_messages_deleted_total',
  help: 'Total messages soft deleted due to retention',
  registers: [registry]
});

const supabaseQueryErrorsTotal = new Counter({
  name: 'supabase_query_errors_total',
  help: 'Total number of Supabase query errors',
  registers: [registry]
});

collectDefaultMetrics({ register: registry });

const recentRequests: RequestSample[] = [];
const recentRateLimitHits: number[] = [];
const MAX_RECENT = 1000;
const SUMMARY_WINDOW_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const ALERT_COOLDOWN_MS = 60 * 1000;

function parseThreshold(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const http5xxThreshold = parseThreshold(process.env.METRICS_5XX_ALERT_THRESHOLD, 5);
const rateLimitThreshold = parseThreshold(process.env.METRICS_RATELIMIT_ALERT_THRESHOLD, 25);

let lastHttpAlertAt = 0;
let lastRateLimitAlertAt = 0;

function cleanupSamples(now: number) {
  while (recentRequests.length > 0 && now - recentRequests[0]!.timestamp > SUMMARY_WINDOW_MS) {
    recentRequests.shift();
  }
}

function cleanupRateLimit(now: number) {
  while (recentRateLimitHits.length > 0 && now - recentRateLimitHits[0]! > RATE_WINDOW_MS) {
    recentRateLimitHits.shift();
  }
}

export function recordRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number
) {
  const durationSeconds = durationMs / 1000;
  httpRequestDurationSeconds.observe({
    method,
    route,
    status: String(statusCode)
  }, durationSeconds);
  const now = Date.now();
  cleanupSamples(now);
  recentRequests.push({ timestamp: now, durationMs, statusCode });
  if (recentRequests.length > MAX_RECENT) {
    recentRequests.shift();
  }
  if (statusCode >= 500) {
    const errors = recentRequests.filter((sample) => now - sample.timestamp <= RATE_WINDOW_MS && sample.statusCode >= 500).length;
    if (errors >= http5xxThreshold && now - lastHttpAlertAt >= ALERT_COOLDOWN_MS) {
      triggerAlert({ type: 'http_5xx_spike', count: errors, windowMs: RATE_WINDOW_MS });
      lastHttpAlertAt = now;
    }
  }
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((percentileValue / 100) * sorted.length));
  return sorted[index] ?? null;
}

export async function getMetricsSummary() {
  const now = Date.now();
  cleanupSamples(now);
  cleanupRateLimit(now);
  const rateWindowStart = now - RATE_WINDOW_MS;
  const rateWindowSamples = recentRequests.filter((sample) => sample.timestamp >= rateWindowStart);
  const durations = rateWindowSamples.map((sample) => sample.durationMs);
  const totalRequests = rateWindowSamples.length;
  const errors = rateWindowSamples.filter((sample) => sample.statusCode >= 500).length;
  const histogram = await httpRequestDurationSeconds.get();
  const rbacMetric = await rbacForbiddenTotal.get();
  const rateLimitMetric = await rateLimitHitTotal.get();
  const cronMetric = await cronRemindersSentTotal.get();
  const privacyExportMetric = await privacyExportTotal.get();
  const privacyEraseRequestedMetric = await privacyEraseRequestedTotal.get();
  const privacyEraseProcessedMetric = await privacyEraseProcessedTotal.get();
  const retentionMessagesMetric = await retentionMessagesDeletedTotal.get();
  const rbacCount = rbacMetric.values.at(0)?.value ?? 0;
  const rateLimitCount = rateLimitMetric.values.at(0)?.value ?? 0;
  const rateLimitPerMinute = recentRateLimitHits.length;
  const latencyP50 = durations.length ? Number((percentile(durations, 50) ?? 0).toFixed(2)) : null;
  const latencyP95 = durations.length ? Number((percentile(durations, 95) ?? 0).toFixed(2)) : null;
  return {
    requestsPerMinute: totalRequests,
    errorsPerMinute: errors,
    rateLimitPerMinute,
    latencyMs: {
      p50: latencyP50,
      p95: latencyP95
    },
    histogramBuckets: histogram.values,
    counters: {
      rbacForbidden: rbacCount,
      rateLimitHit: rateLimitCount,
      cronRemindersSent: cronMetric.values.at(0)?.value ?? 0,
      privacyExport: privacyExportMetric.values.at(0)?.value ?? 0,
      privacyEraseRequested: privacyEraseRequestedMetric.values.at(0)?.value ?? 0,
      privacyEraseProcessed: privacyEraseProcessedMetric.values.at(0)?.value ?? 0,
      retentionMessagesDeleted: retentionMessagesMetric.values.at(0)?.value ?? 0
    }
  };
}

export function isMetricsEnabled() {
  return (process.env.METRICS_ENABLED || 'false').toLowerCase() === 'true';
}

export function getMetricsRegistry() {
  return registry;
}

export function incrementMagicInitiate() {
  authMagicInitiateTotal.inc();
}

export function incrementMagicVerify() {
  authMagicVerifyTotal.inc();
}

export function incrementRbacForbidden() {
  rbacForbiddenTotal.inc();
}

export function incrementRateLimitHit() {
  rateLimitHitTotal.inc();
  const now = Date.now();
  recentRateLimitHits.push(now);
  cleanupRateLimit(now);
  const hits = recentRateLimitHits.length;
  if (hits >= rateLimitThreshold && now - lastRateLimitAlertAt >= ALERT_COOLDOWN_MS) {
    triggerAlert({ type: 'rate_limit_spike', count: hits, windowMs: RATE_WINDOW_MS });
    lastRateLimitAlertAt = now;
  }
}

export function incrementEmailSend(status: 'success' | 'failed') {
  emailSendTotal.inc({ status });
}

export function incrementPushSend(status: 'success' | 'failed') {
  pushSendTotal.inc({ status });
}

export function incrementCronRemindersSent(count: number) {
  if (count <= 0) return;
  cronRemindersSentTotal.inc(count);
}

export function incrementPrivacyExport() {
  privacyExportTotal.inc();
}

export function incrementPrivacyEraseRequested() {
  privacyEraseRequestedTotal.inc();
}

export function incrementPrivacyEraseProcessed() {
  privacyEraseProcessedTotal.inc();
}

export function incrementRetentionMessagesDeleted(count: number) {
  if (count <= 0) return;
  retentionMessagesDeletedTotal.inc(count);
}

export function incrementSupabaseQueryErrors() {
  supabaseQueryErrorsTotal.inc();
}

export type MetricsSummary = Awaited<ReturnType<typeof getMetricsSummary>>;
