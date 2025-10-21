import { getSupabase } from '../db/supabase.js';
import { incrementSupabaseQueryErrors } from '../metrics.js';

export interface AuditQuery {
  limit?: number;
  page?: number;
  action?: string;
  email?: string;
  from?: string;
  to?: string;
}

function parseLimit(input?: number): number {
  const limit = Number(input);
  if (!Number.isFinite(limit) || limit <= 0) return 50;
  return Math.min(limit, 200);
}

function parsePage(input?: number): number {
  const page = Number(input);
  if (!Number.isFinite(page) || page <= 0) return 1;
  return page;
}

function normaliseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export async function listAuditLogs(query: AuditQuery) {
  const sb = getSupabase();
  const limit = parseLimit(query.limit);
  const page = parsePage(query.page);
  const offset = (page - 1) * limit;

  const fromIso = normaliseDate(query.from);
  const toIso = normaliseDate(query.to);
  const action = query.action?.trim() || undefined;
  const emailOrUser = query.email?.trim();

  let userIds: string[] = [];
  if (emailOrUser) {
    if (emailOrUser.includes('@')) {
      const { data: users, error } = await sb
        .from('users')
        .select('id')
        .ilike('email', `%${emailOrUser}%`);
      if (error) {
        incrementSupabaseQueryErrors();
        throw error;
      }
      userIds = users?.map((user) => user.id) ?? [];
    }
    if (emailOrUser.length >= 8) {
      userIds.push(emailOrUser);
    }
    userIds = Array.from(new Set(userIds));
    if (emailOrUser && emailOrUser.includes('@') && userIds.length === 0) {
      return { items: [], total: 0 };
    }
  }

  let builder = sb
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (action) {
    builder = builder.eq('action', action);
  }
  if (fromIso) {
    builder = builder.gte('created_at', fromIso);
  }
  if (toIso) {
    builder = builder.lte('created_at', toIso);
  }
  if (userIds.length > 0) {
    const joined = userIds.join(',');
    builder = builder.or(`actor_user_id.in.(${joined}),target_user_id.in.(${joined})`);
  }

  const rangeStart = offset;
  const rangeEnd = offset + limit - 1;
  const { data, count, error } = await builder.range(rangeStart, rangeEnd);
  if (error) {
    incrementSupabaseQueryErrors();
    throw error;
  }

  return {
    items: data ?? [],
    total: count ?? 0
  };
}
