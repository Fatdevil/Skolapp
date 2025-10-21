import { randomUUID } from 'node:crypto';
import { getSupabase } from '../db/supabase.js';
import { decryptPII, encryptPII, hmacTokenHash, maskPII } from '../util/crypto.js';
import { incrementDevicesRegistered } from '../metrics.js';

type DeviceRow = {
  id: string;
  class_id: string;
  user_id: string | null;
  expo_token: string | null;
  expo_token_iv: string | null;
  expo_token_tag: string | null;
  token_hash?: string | null;
  created_at?: string;
  last_seen_at?: string | null;
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
  const tokenHash = hmacTokenHash(expoToken);
  const { data: existing, error: fetchError } = await sb
    .from('devices')
    .select('id,user_id,last_seen_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const encrypted = encryptPII(expoToken);
  const nowIso = new Date().toISOString();

  if (existing) {
    const updatePayload: Record<string, any> = {
      class_id: classId,
      expo_token: encrypted.ct,
      expo_token_iv: encrypted.iv,
      expo_token_tag: encrypted.tag,
      last_seen_at: nowIso
    };
    if (userId && !existing.user_id) {
      updatePayload.user_id = userId;
    }
    const { error: updateError } = await sb.from('devices').update(updatePayload).eq('id', existing.id);
    if (updateError) throw updateError;
    incrementDevicesRegistered();
    return true;
  }

  const insertPayload = {
    id: randomUUID(),
    class_id: classId,
    user_id: userId ?? null,
    expo_token: encrypted.ct,
    expo_token_iv: encrypted.iv,
    expo_token_tag: encrypted.tag,
    token_hash: tokenHash,
    created_at: nowIso,
    last_seen_at: nowIso
  };
  const { error: insertError } = await sb.from('devices').insert(insertPayload);
  if (insertError) throw insertError;
  incrementDevicesRegistered();
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
