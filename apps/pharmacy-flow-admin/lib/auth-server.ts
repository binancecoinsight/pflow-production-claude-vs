import { createClient as createServerSupabase } from './supabase/server';
import {
  evaluateAdminProfile,
  type AdminAuthResult,
  type PlatformAdminRecord,
} from './auth';

/**
 * Server-side helper to authenticate the current request and verify platform-admin status.
 * Evaluated strictly on the server:
 * 1. Validates Supabase Auth JWT via supabase.auth.getUser() (not getSession).
 * 2. Queries public.platform_admins for an active record matching auth.uid().
 * 3. Fails closed on any error, missing session, inactive flag, or missing admin record.
 */
export async function getAuthenticatedAdmin(): Promise<AdminAuthResult> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) {
      return {
        status: 'error',
        user: null,
        admin: null,
        reason: 'Supabase server client not configured. Check environment variables.',
      };
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return evaluateAdminProfile(null, null, { userError });
    }

    // Query public.platform_admins table protected by M-1 RLS (user_id = auth.uid())
    const { data: adminRecord, error: adminError } = await supabase
      .from('platform_admins')
      .select('user_id, platform_role, is_active, granted_at, notes')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    return evaluateAdminProfile(user, adminRecord as PlatformAdminRecord | null, { adminError });
  } catch (err: any) {
    return {
      status: 'error',
      user: null,
      admin: null,
      reason: err?.message || 'Unexpected server error during admin authentication check.',
    };
  }
}
