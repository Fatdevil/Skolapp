import { getSupabase } from '../db/supabase.js';
import type { Role } from '../util/roles.js';
import { isRoleHigher, maxRole } from '../util/roles.js';

function toUserId(email: string) {
  return 'user-' + Buffer.from(email).toString('hex').slice(0, 8);
}

export async function upsertUserByEmail(email: string, role: Role = 'guardian') {
  const sb = getSupabase();
  const existing = await sb.from('users').select('*').eq('email', email).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const currentRole = (existing.data.role ?? 'guardian') as Role;
    const upgradedRole = maxRole(currentRole, role);
    if (isRoleHigher(currentRole, upgradedRole)) {
      const { data: updated, error: updateError } = await sb
        .from('users')
        .update({ role: upgradedRole })
        .eq('id', existing.data.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      return updated;
    }
    return existing.data;
  }
  const id = toUserId(email);
  const row = {
    id,
    email,
    role: role || 'guardian',
    loa_level: 'low',
    created_at: new Date().toISOString()
  };
  const { data, error } = await sb.from('users').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

export async function getUserByEmail(email: string) {
  const sb = getSupabase();
  const { data, error } = await sb.from('users').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateUserRole(userId: string, role: Role) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('users')
    .update({ role })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function hasAnyAdmin() {
  const sb = getSupabase();
  const { data, error } = await sb.from('users').select('id').eq('role', 'admin').limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}