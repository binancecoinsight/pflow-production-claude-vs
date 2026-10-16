'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const supabase = createClient();
      if (!supabase) {
        setErrorMessage('Authentication service is not configured. Missing environment variables.');
        setLoading(false);
        return;
      }

      // 1. Authenticate credentials against Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !authData.user) {
        setErrorMessage(authError?.message || 'Invalid email or password.');
        setLoading(false);
        return;
      }

      // 2. Authorize platform-admin status against public.platform_admins (M-1 RLS)
      const { data: adminRecord, error: adminError } = await supabase
        .from('platform_admins')
        .select('platform_role, is_active')
        .eq('user_id', authData.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (adminError || !adminRecord) {
        // Immediately revoke session to fail closed for unauthorized users
        await supabase.auth.signOut();
        setErrorMessage(
          'Access Denied: Your account is authenticated, but you are not registered as an authorized Platform Administrator.'
        );
        setLoading(false);
        return;
      }

      // 3. Authorized platform admin -> proceed to console
      router.push('/');
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred during sign-in.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col justify-center items-center px-4 py-12 selection:bg-accent/20 selection:text-accent">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-accent to-emerald-400 items-center justify-center shadow-xl shadow-accent/20 text-slate-950 font-bold text-2xl mb-4">
            <ShieldCheck className="w-6 h-6 text-slate-950" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Platform Administration
          </h1>
          <p className="text-xs text-text-secondary mt-1.5">
            Central Management Console for Authorized Super Admins & Operators
          </p>
        </div>

        {/* Login Card */}
        <div className="card-glass p-8 border border-border shadow-2xl backdrop-blur-xl rounded-2xl">
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-error/10 border border-error/20 flex items-start gap-3 text-xs text-error">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Administrator Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary w-4 h-4" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@pharmacyflow.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card/60 border border-border text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary w-4 h-4" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-card/60 border border-border text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-accent text-accent-foreground font-semibold text-xs flex items-center justify-center gap-2 hover:opacity-90 transition shadow-lg shadow-accent/20 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Admin Console</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center text-[11px] text-text-secondary">
            <span>Restricted Access • Authorized Personnel Only</span>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center text-xs text-text-secondary">
          <p>Protected by PostgreSQL Row Level Security & Platform Admin Grants</p>
        </div>
      </div>
    </div>
  );
}
