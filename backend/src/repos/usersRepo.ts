import type { Role } from '../auth/session.js';
import { getSupabase } from '../db/supabase.js';
import { maxRole } from '../util/roles.js';

export async function upsertUserByEmail(email:string,role:Role='guardian'){
  const sb=getSupabase(); const id='user-'+Buffer.from(email).toString('hex').slice(0,8);
  const existing = await sb.from('users').select('*').eq('email',email).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data){
    const desired = maxRole(existing.data.role as Role, role);
    if(desired !== existing.data.role){
      const {data,error}=await sb.from('users').update({role:desired}).eq('id',existing.data.id).select('*').single();
      if(error) throw error;
      return data;
    }
    return existing.data;
  }
  const row={id,email,role:role||'guardian',loa_level:'low',created_at:new Date().toISOString()};
  const {data,error}=await sb.from('users').insert(row).select('*').single(); if(error) throw error; return data;
}

export async function getUserByEmail(email: string) {
  const sb = getSupabase();
  const { data, error } = await sb.from('users').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getUserById(id: string) {
  const sb = getSupabase();
  const { data, error } = await sb.from('users').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateUserRole(userId: string, role: Role) {
  const sb = getSupabase();
  const { data, error } = await sb.from('users').update({ role }).eq('id', userId).select('*').single();
  if (error) throw error;
  return data;
}

export async function hasAdminUser() {
  const sb = getSupabase();
  const { count, error } = await sb
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function updatePrivacyConsent(userId: string, version: number) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('users')
    .update({ privacy_consent_version: version, privacy_consent_at: now })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function markEraseRequested(userId: string) {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('users')
    .update({ erase_requested_at: now })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function anonymiseUser(userId: string) {
  const sb = getSupabase();
  const surrogateEmail = `deleted-${userId}@erased.local`;
  const { error } = await sb
    .from('users')
    .update({
      email: surrogateEmail,
      privacy_consent_at: null,
      privacy_consent_version: null,
      erase_requested_at: null,
      deleted: true
    })
    .eq('id', userId);
  if (error) throw error;
}