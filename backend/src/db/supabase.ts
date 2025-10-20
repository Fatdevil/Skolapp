import { createClient, SupabaseClient } from '@supabase/supabase-js';
let supabase: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) throw new Error('Supabase not configured');
  supabase = createClient(url, key, { auth: { persistSession: false } });
  return supabase;
}