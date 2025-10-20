import { getSupabase } from '../db/supabase.js';
export async function registerDevice(classId:string,expoToken:string){
  const sb=getSupabase(); const {error}=await sb.from('devices').upsert({id:crypto.randomUUID(),class_id:classId,expo_token:expoToken,created_at:new Date().toISOString()},{onConflict:'expo_token'});
  if(error) throw error; return true;
}
export async function getClassTokens(classId:string):Promise<string[]>{
  const sb=getSupabase(); const {data,error}=await sb.from('devices').select('expo_token').eq('class_id',classId);
  if(error) throw error; return (data||[]).map((r:any)=>r.expo_token);
}