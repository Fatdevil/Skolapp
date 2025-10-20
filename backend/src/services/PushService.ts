import { Expo } from 'expo-server-sdk';
const expo = new Expo();
export async function sendPush(tokens:string[], title:string, body:string){
  if(tokens.length===0) return { delivered: 0 };
  const messages = tokens.map(t=>({to:t,sound:'default' as const,title,body}));
  const chunks = expo.chunkPushNotifications(messages);
  let delivered=0;
  for(const chunk of chunks){ try{ const receipts = await expo.sendPushNotificationsAsync(chunk); delivered+=receipts.length; } catch(e){ console.error('[PUSH]',e); } }
  return { delivered };
}