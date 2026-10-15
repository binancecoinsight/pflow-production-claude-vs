import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) || 
  '';
const supabaseAnonKey = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || 
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) || 
  '';

/**
 * Validates whether the Supabase public environment variables are populated.
 */
export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== 'https://your-project.supabase.co' &&
    supabaseAnonKey !== 'your-anon-key-here'
  );
};

if (!isSupabaseConfigured()) {
  console.warn(
    '[PharmacyFlow] Supabase client initialized with placeholder credentials. ' +
    'Provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment to connect to your live project.'
  );
}

/**
 * Authoritative Supabase Client for PharmacyFlow
 * - Browser session persistence enabled
 * - Automatic JWT token refresh
 * - Strictly anon/publishable access governed by PostgreSQL Row Level Security
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'pharmacyflow.auth.token'
    }
  }
);
