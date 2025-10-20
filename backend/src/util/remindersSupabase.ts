import cron from 'node-cron'; import { getSupabase } from '../db/supabase.js'; import { sendPush } from '../services/PushService.js';
let lastRun = { at: 0, checked: 0, sent: 0 };
export function startReminderWorkerSupabase(){
  const sb=getSupabase();
  cron.schedule('* * * * *', async () => {
    lastRun.at = Date.now(); lastRun.checked = 0; lastRun.sent = 0;
    const {data:events,error}=await sb.from('events').select('*'); if(error){console.error('[REMINDERS]',error.message);return;}
    for(const e of (events||[])){
      lastRun.checked++;
      const startTs=+new Date(e.start); const t24=startTs-24*3600*1000; const t2=startTs-2*3600*1000;
      if(Math.abs(Date.now()-t24)<30000 || Math.abs(Date.now()-t2)<30000){
        const key=`event:${e.id}:${Math.abs(Date.now()-t24)<30000?'t24':'t2'}`;
        const {data:sent}=await sb.from('reminders_sent').select('*').eq('key',key).limit(1);
        if(!sent || sent.length===0){
          await sb.from('reminders_sent').insert({key,created_at:new Date().toISOString()});
          const {data:devs}=await sb.from('devices').select('expo_token').eq('class_id',e.class_id);
          const tokens=(devs||[]).map((r:any)=>r.expo_token);
          lastRun.sent++; await sendPush(tokens,'Påminnelse',`${e.title} – ${new Date(e.start).toLocaleString()}`);
        }
      }
    }
  });
}
export function getRemindersHealth(){ return lastRun; }