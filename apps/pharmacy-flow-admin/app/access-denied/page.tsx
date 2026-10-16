'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { ShieldAlert, LogOut, Loader2 } from 'lucide-react';

export default function AccessDeniedPage() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const supabase = createClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md card-glass p-8 border border-border shadow-2xl backdrop-blur-xl rounded-2xl text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-error/15 border border-error/30 text-error mx-auto flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-text-primary">
            Access Denied
          </h1>
          <p className="text-xs text-text-secondary leading-relaxed">
            Your authenticated account is not registered as an authorized Platform Administrator in the system database.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-card/60 border border-border text-left text-xs text-text-secondary space-y-2">
          <p className="font-semibold text-text-primary">
            Security Policy Notice
          </p>
          <p>
            Under PharmacyFlow&apos;s Row Level Security architecture, access to the Central Platform Console is strictly restricted to active entries in <code className="text-accent font-mono">public.platform_admins</code>.
          </p>
          <p>
            If you are a pharmacy owner or staff member, please log in through your respective tenant pharmacy portal.
          </p>
        </div>

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full py-2.5 px-4 rounded-xl bg-card hover:bg-error/15 text-text-primary hover:text-error border border-border hover:border-error/30 text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          {signingOut ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing Out...</span>
            </>
          ) : (
            <>
              <LogOut className="w-4 h-4" />
              <span>Sign Out & Return to Login</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
