import { getSupabase } from '../db/supabase.js';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export async function createInvitation(
  email:string,
  classCode:string,
  token:string,
  role:'guardian'|'teacher'|'admin'='guardian'
){
  const sb=getSupabase();
  const row={
    id:crypto.randomUUID(),
    email,
    class_code:classCode,
    token,
    created_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+FIFTEEN_MINUTES_MS).toISOString(),
    used_at:null,
    role
  };
  const {data,error}=await sb.from('invitations').insert(row).select('*').single(); if(error) throw error; return data;
}
export async function getInvitationByToken(token:string){
  const sb=getSupabase();
  const {data,error}=await sb.from('invitations').select('*').eq('token',token).maybeSingle();
  if(error) throw error; return data;
}

export async function markInvitationUsed(token:string){
  const sb=getSupabase();
  const {error}=await sb.from('invitations').update({used_at:new Date().toISOString()}).eq('token',token).is('used_at',null);
  if(error) throw error;
}