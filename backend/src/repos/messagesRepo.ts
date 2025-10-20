import { getSupabase } from '../db/supabase.js';
export async function listMessages(classId:string){
  const sb=getSupabase(); const {data,error}=await sb.from('messages').select('*').eq('class_id',classId).order('created_at',{ascending:false});
  if(error) throw error; return data||[];
}
export async function postMessage(input:{classId:string;senderId:string;senderName:string;text:string;flagged:boolean}){
  const sb=getSupabase(); const row={class_id:input.classId,sender_id:input.senderId,sender_name:input.senderName,text:input.text,flagged:input.flagged?1:0,created_at:new Date().toISOString()};
  const {data,error}=await sb.from('messages').insert(row).select('*').single();
  if(error) throw error; return data;
}