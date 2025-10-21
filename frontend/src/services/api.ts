import axios from 'axios';

export type UserRole = 'guardian' | 'teacher' | 'admin';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  privacyConsentVersion?: number | null;
  privacyConsentAt?: string | null;
  eraseRequestedAt?: string | null;
}

export interface MetricsSummary {
  requestsPerMinute: number;
  errorsPerMinute: number;
  rateLimitPerMinute: number;
  latencyMs: { p50: number | null; p95: number | null };
  counters: {
    rbacForbidden: number;
    rateLimitHit: number;
    cronRemindersSent: number;
  };
}

export interface CronHealth {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  sent24h: number;
}

export interface AuditLogItem {
  id?: string;
  action: string;
  created_at: string;
  actor_user_id: string | null;
  target_user_id: string | null;
  meta: Record<string, any> | null;
}

export interface AuditQuery {
  limit?: number;
  page?: number;
  action?: string;
  email?: string;
  from?: string;
  to?: string;
}

export interface AuditResponse {
  items: AuditLogItem[];
  total: number;
}

export interface WhoAmIResponse {
  user: AuthenticatedUser;
}

export interface PrivacyPolicyResponse {
  version: number;
  text: string;
}

const baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3333';

export const api = axios.create({
  baseURL,
  withCredentials: true
});

export async function getCapabilities() {
  return (await api.get('/auth/capabilities')).data;
}

export async function initiateMagicLink(email: string, classCode: string) {
  return (await api.post('/auth/magic/initiate', { email, classCode })).data as { ok: true; token?: string };
}

export async function verifyMagicToken(token: string) {
  return (await api.post('/auth/magic/verify', { token })).data as WhoAmIResponse;
}

export async function whoami() {
  return (await api.get<WhoAmIResponse>('/auth/whoami')).data;
}

export async function logout() {
  return (await api.post('/auth/logout')).data as { ok: true };
}

export async function getHealth() {
  return (await api.get('/health')).data;
}

export async function getSystemHealth() {
  return (await api.get('/system/health')).data as Record<string, any>;
}

export async function getCronHealth() {
  return (await api.get<CronHealth>('/reminders/health')).data;
}

export async function getMetricsSummary() {
  return (await api.get<MetricsSummary>('/metrics/summary')).data;
}

export async function getEvents(classId: string) {
  return (await api.get(`/classes/${classId}/events`)).data;
}

export async function createEvent(body: {
  classId: string;
  type: string;
  title: string;
  description?: string;
  start: string;
  end: string;
}) {
  return (await api.post(`/events`, body)).data;
}

export async function deleteEvent(id: string) {
  return (await api.delete(`/events/${id}`)).data;
}

export async function getMessages(classId: string) {
  return (await api.get(`/classes/${classId}/messages`)).data;
}

export async function sendMessage(payload: { classId: string; text: string }) {
  return (await api.post(`/messages`, payload)).data;
}

export async function registerDevice(payload: { expoPushToken: string; classId: string }) {
  return (await api.post('/devices/register', payload)).data;
}

export async function uploadInvites(csvText: string) {
  return (await api.post('/admin/invitations', { csvText })).data;
}

export async function promoteUser(payload: { email: string; role: UserRole }) {
  return (await api.post('/admin/promote', payload)).data as { user: AuthenticatedUser };
}

export async function sendTestPush(payload: { classId: string; title: string; body: string }) {
  return (await api.post('/admin/test-push', payload)).data;
}

export async function getAuditLogs(params: AuditQuery) {
  return (await api.get<AuditResponse>('/admin/audit', { params })).data;
}

export async function getPrivacyPolicy() {
  return (await api.get<PrivacyPolicyResponse>('/privacy/policy')).data;
}

export async function submitPrivacyConsent(version: number) {
  return (await api.post('/privacy/consent', { version })).data as { ok: true; consent: { version: number; at: string } };
}

export async function requestPrivacyExport() {
  return (await api.post('/privacy/export')).data;
}

export async function requestPrivacyErase() {
  return (await api.post('/privacy/erase')).data as { ok: true; queueId: number };
}