import { Expo } from 'expo-server-sdk';
import { incrementPushSend } from '../metrics.js';

const expo = new Expo();

export async function sendPush(tokens: string[], title: string, body: string) {
  if (tokens.length === 0) {
    return { delivered: 0 };
  }
  const messages = tokens.map((token) => ({ to: token, sound: 'default' as const, title, body }));
  const chunks = expo.chunkPushNotifications(messages);
  let delivered = 0;
  let hadError = false;
  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      delivered += receipts.length;
    } catch (err) {
      hadError = true;
      console.error('[PUSH]', err);
    }
  }
  incrementPushSend(hadError ? 'failed' : 'success');
  return { delivered };
}
