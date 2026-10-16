import { redirect } from 'next/navigation';
import { getAuthenticatedAdmin } from '@/lib/auth-server';
import Dashboard from '@/components/Dashboard';

export default async function Home() {
  // Server-side verification: independent from middleware for defense-in-depth
  const authResult = await getAuthenticatedAdmin();

  if (authResult.status === 'unauthenticated') {
    redirect('/login');
  }

  if (authResult.status === 'forbidden') {
    redirect('/access-denied');
  }

  if (authResult.status === 'error') {
    return (
      <main className="min-h-screen bg-background text-text-primary flex items-center justify-center p-4">
        <div className="card-glass max-w-md p-6 text-center space-y-4 border border-border rounded-xl">
          <h2 className="text-base font-bold text-error">System Configuration Error</h2>
          <p className="text-xs text-text-secondary leading-relaxed">{authResult.reason}</p>
          <a
            href="/login"
            className="inline-block px-4 py-2 rounded-lg bg-accent text-accent-foreground text-xs font-semibold"
          >
            Return to Login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <Dashboard
        adminUser={authResult.user}
        adminProfile={authResult.admin}
      />
    </main>
  );
}
