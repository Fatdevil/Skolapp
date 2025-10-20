import { getSupabase } from '../db/supabase.js';
export async function ensureDefaultClass(){
  const sb=getSupabase(); const cls={id:'class-1',name:'Klass 3A',code:'3A'}; await sb.from('classes').upsert(cls,{onConflict:'id'}); return cls;
}
export async function getClassByCode(code:string){
  const sb=getSupabase(); const {data,error}=await sb.from('classes').select('*').eq('code',code).maybeSingle(); if(error) throw error; return data;
}