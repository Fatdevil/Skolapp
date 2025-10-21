import { getSupabase } from '../db/supabase.js';

type EventInput = {
  classId: string;
  type: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  createdBy: string;
};

export async function listEvents(classId: string) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('events')
    .select('*')
    .eq('class_id', classId)
    .is('deleted_at', null)
    .order('start', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createEvent(input: EventInput) {
  const sb = getSupabase();
  const row = {
    class_id: input.classId,
    type: input.type,
    title: input.title,
    description: input.description || '',
    start: new Date(input.start).toISOString(),
    end: new Date(input.end).toISOString(),
    created_at: new Date().toISOString(),
    created_by: input.createdBy,
    deleted_at: null
  };
  const { data, error } = await sb.from('events').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id: string, userId: string | null) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const query = sb
    .from('events')
    .update({ deleted_at: now })
    .eq('id', id);
  if (userId) {
    query.eq('created_by', userId);
  }
  const { error } = await query;
  if (error) throw error;
  return { ok: true };
}

export async function redactEventsForUser(userId: string) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('events')
    .update({ deleted_at: now, title: '[redacted]', description: '' })
    .eq('created_by', userId)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
