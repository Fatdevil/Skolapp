import { getSupabase } from '../db/supabase.js';
export async function listEvents(classId:string){
  const sb=getSupabase(); const {data,error}=await sb.from('events').select('*').eq('class_id',classId).order('start',{ascending:true});
  if(error) throw error; return data||[];
}
export async function createEvent(input:{classId:string;type:string;title:string;description?:string;start:string;end:string}){
  const sb=getSupabase(); const row={class_id:input.classId,type:input.type,title:input.title,description:input.description||'',start:new Date(input.start).toISOString(),end:new Date(input.end).toISOString(),created_at:new Date().toISOString()};
  const {data,error}=await sb.from('events').insert(row).select('*').single();
  if(error) throw error; return data;
}
export async function deleteEvent(id: string) {
  const sb = getSupabase();
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) throw error;
  return { ok: true };
}