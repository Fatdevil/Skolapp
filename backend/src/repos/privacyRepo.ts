import { getSupabase } from '../db/supabase.js';
import { listDevicesForUser } from './devicesRepo.js';

type EraseQueueRow = {
  id: number;
  user_id: string;
  requested_at: string;
  forced: boolean;
  processed_at: string | null;
};

export async function enqueueEraseRequest(userId: string, forced = false) {
  const sb = getSupabase();
  const { data: existing, error: existingError } = await sb
    .from('gdpr_erase_queue')
    .select('*')
    .eq('user_id', userId)
    .is('processed_at', null)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (forced && !existing.forced) {
      await sb
        .from('gdpr_erase_queue')
        .update({ forced: true })
        .eq('id', existing.id);
    }
    return existing as EraseQueueRow;
  }
  const { data, error } = await sb
    .from('gdpr_erase_queue')
    .insert({ user_id: userId, forced })
    .select('*')
    .single();
  if (error) throw error;
  return data as EraseQueueRow;
}

export async function listPendingEraseRequests() {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('gdpr_erase_queue')
    .select('*')
    .is('processed_at', null)
    .order('requested_at', { ascending: true });
  if (error) throw error;
  return (data || []) as EraseQueueRow[];
}

export async function markEraseProcessed(id: number) {
  const sb = getSupabase();
  const { error } = await sb
    .from('gdpr_erase_queue')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function collectUserExport(userId: string) {
  const sb = getSupabase();
  const [
    { data: user, error: userError },
    { data: messages, error: messagesError },
    { data: events, error: eventsError },
    { data: audits, error: auditsError }
  ] = await Promise.all([
    sb.from('users').select('*').eq('id', userId).maybeSingle(),
    sb
      .from('messages')
      .select('*')
      .eq('sender_id', userId)
      .is('deleted_at', null),
    sb
      .from('events')
      .select('*')
      .eq('created_by', userId)
      .is('deleted_at', null),
    sb
      .from('audit_logs')
      .select('*')
      .or(`actor_user_id.eq.${userId},target_user_id.eq.${userId}`)
  ]);
  if (userError) throw userError;
  if (messagesError) throw messagesError;
  if (eventsError) throw eventsError;
  if (auditsError) throw auditsError;
  const devices = await listDevicesForUser(userId);
  return {
    user,
    devices,
    messages: messages || [],
    events: events || [],
    auditLogs: audits || []
  };
}
