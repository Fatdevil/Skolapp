import { randomUUID } from 'node:crypto';
import { getSupabase } from '../db/supabase.js';
import { decryptPII, encryptPII, maskPII } from '../util/crypto.js';

type DeviceRow = {
  id: string;
  class_id: string;
  user_id: string | null;
  expo_token: string | null;
  expo_token_iv: string | null;
  expo_token_tag: string | null;
  created_at?: string;
};

function decryptToken(row: DeviceRow): string | null {
  if (!row.expo_token) return null;
  if (row.expo_token_iv && row.expo_token_tag) {
    return decryptPII({ ct: row.expo_token, iv: row.expo_token_iv, tag: row.expo_token_tag });
  }
  return decryptPII(row.expo_token);
}

export async function registerDevice(classId: string, expoToken: string, userId?: string | null) {
  const sb = getSupabase();
  const encrypted = encryptPII(expoToken);
  const payload = {
    id: randomUUID(),
    class_id: classId,
    user_id: userId ?? null,
    expo_token: encrypted.ct,
    expo_token_iv: encrypted.iv,
    expo_token_tag: encrypted.tag,
    created_at: new Date().toISOString()
  };
  const { error } = await sb.from('devices').upsert(payload, {
    onConflict: 'expo_token'
  });
  if (error) throw error;
  return true;
}

export async function getClassTokens(classId: string): Promise<string[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('devices')
    .select('expo_token,expo_token_iv,expo_token_tag')
    .eq('class_id', classId);
  if (error) throw error;
  return (data || [])
    .map((row: any) => decryptToken(row as DeviceRow))
    .filter((value: string | null): value is string => Boolean(value));
}

export async function listDevicesForUser(userId: string) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('devices')
    .select('id,class_id,expo_token,expo_token_iv,expo_token_tag,created_at')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const decrypted = decryptToken(row as DeviceRow);
    return {
      id: row.id,
      classId: row.class_id,
      createdAt: row.created_at,
      pushTokenMasked: maskPII(decrypted)
    };
  });
}

export async function deleteDevicesForUser(userId: string) {
  const sb = getSupabase();
  const { data, error } = await sb.from('devices').delete().eq('user_id', userId).select('id');
  if (error) throw error;
  return data?.length ?? 0;
}
