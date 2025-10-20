import { getSupabase } from '../db/supabase.js';

export async function audit(
  action: string,
  meta: Record<string, unknown> | null,
  actorUserId?: string,
  targetUserId?: string
) {
  const sb = getSupabase();
  await sb.from('audit_logs').insert({
    action,
    meta: meta ?? null,
    actor_user_id: actorUserId ?? null,
    target_user_id: targetUserId ?? null
  });
}
