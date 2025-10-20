import { getSupabase } from '../db/supabase.js';
export async function upsertUserByEmail(email:string,role:'guardian'|'teacher'|'admin'='guardian'){
  const sb=getSupabase(); const id='user-'+Buffer.from(email).toString('hex').slice(0,8);
  const existing = await sb.from('users').select('*').eq('email',email).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data) return existing.data;
  const row={id,email,role:role||'guardian',loa_level:'low',created_at:new Date().toISOString()};
  const {data,error}=await sb.from('users').insert(row).select('*').single(); if(error) throw error; return data;
}