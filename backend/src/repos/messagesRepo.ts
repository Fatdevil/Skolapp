import { getSupabase } from '../db/supabase.js';

type MessageInput = {
  classId: string;
  senderId: string;
  senderName: string;
  text: string;
  flagged: boolean;
};

export async function listMessages(classId: string) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('messages')
    .select('*')
    .eq('class_id', classId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function postMessage(input: MessageInput) {
  const sb = getSupabase();
  const row = {
    class_id: input.classId,
    sender_id: input.senderId,
    sender_name: input.senderName,
    text: input.text,
    flagged: input.flagged ? 1 : 0,
    created_at: new Date().toISOString(),
    deleted_at: null
  };
  const { data, error } = await sb.from('messages').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function redactMessagesForUser(userId: string) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('messages')
    .update({ text: '[redacted]', deleted_at: now })
    .eq('sender_id', userId)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

export async function applyMessageRetention(olderThanIso: string) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .lt('created_at', olderThanIso)
    .is('deleted_at', null)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
