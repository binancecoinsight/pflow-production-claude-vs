import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface User {
  id: string;
  name: string;
  username: string;
  role: string;
  permissions?: string[];
  pharmacyId?: string;
  branchId?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  signup: (
    name: string,
    phone: string,
    pharmacyName: string,
    email: string,
    country: string,
    state: string,
    city: string,
    address: string,
    password: string
  ) => Promise<boolean>;
  checkPharmacyExists: (pharmacyName: string) => Promise<boolean>;
  checkAccountExists: (email: string, phone: string, pharmacyName: string) => Promise<{ exists: boolean, error?: string }>;
  verifyOtp: (code: string, userData: any) => Promise<{success: boolean, error?: string}>;
  sendOtp: (email: string) => Promise<{success: boolean, error?: string}>;
  logout: () => void;
  isLoading: boolean;
  hasLoggedOut: boolean;
}

export const DEFAULT_USER: User = {
  id: 'user-admin-default',
  name: 'Admin Pharmacist',
  username: 'admin',
  role: 'store owner',
  pharmacyId: 'pharmacy-default',
  branchId: 'branch-default',
  permissions: [
    'dashboard', 'inventory', 'sales', 'accounts', 'history', 'reports',
    'expenses', 'purchases', 'market-list', 'calendar', 'users', 'settings',
    'payroll', 'invoices', 'tutorials', 'referrals', 'subscriptions', 'branches', 'returns'
  ]
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(() => {
    const savedUser = localStorage.getItem('store_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        if (parsed?.id) return { ...DEFAULT_USER, ...parsed };
      } catch (e) {}
    }
    return DEFAULT_USER;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoggedOut, setHasLoggedOut] = useState(false);

  useEffect(() => {
    // Keep user state in sync with full admin permissions
    localStorage.setItem('store_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    // Sync user state with server on mount to get latest permissions
    const syncUser = async () => {
      if (user?.id) {
        try {
          const res = await apiFetch('/api/auth/me');
          if (res.ok && res.headers.get('Content-Type')?.includes('application/json')) {
            const data = await res.json();
            if (data.success) {
              setUser(data.user);
              localStorage.setItem('store_user', JSON.stringify(data.user));
            } else if (data.status === 401) {
              // User no longer exists or is inactive
              logout();
            }
          } else if (res.status === 401) {
            logout();
          }
        } catch (err) {
          console.error('Failed to sync user', err);
        }
      }
    };
    syncUser();
  }, []);

  useEffect(() => {
    // Sync user state with localStorage if needed
    if (user) {
      localStorage.setItem('store_user', JSON.stringify(user));
      if (user.role === 'admin' || user.role === 'store owner' || user.role === 'store_owner') {
         import('../services/syncService').then(({ syncService }) => {
            syncService.init().then(() => {
               syncService.startPeriodicSync();
            }).catch(console.error);
         });
      }
    } else {
      localStorage.removeItem('store_user');
      import('../services/syncService').then(({ syncService }) => {
         syncService.stopPeriodicSync();
      });
    }
  }, [user]);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      let data: any = null;
      if (res.headers.get('Content-Type')?.includes('application/json')) {
        data = await res.json();
      }
      
      if (res.ok && data?.success) {
        setUser(data.user);
        localStorage.setItem('store_user', JSON.stringify(data.user));
          setHasLoggedOut(false);
          localStorage.removeItem('has_logged_out');
          
          import('../services/syncService').then(({ syncService }) => {
            syncService.init(username, password).then(() => {
              syncService.startPeriodicSync();
            }).catch(console.error);
          });
          
          return true;
        
      }

      // Local login failed.
      // Attempt Supabase login as fallback
      const { supabase } = await import('../lib/supabase');
      let supaErrorMessage = '';
      if (supabase) {
        const { data: supaAuth, error: supaError } = await supabase.auth.signInWithPassword({
          email: username,
          password
        });
        
        if (supaError) {
           supaErrorMessage = supaError.message;
        }
        
        if (!supaError && supaAuth.user) {
          const { data: supaUser, error: roleError } = await supabase
            .from('users')
            .select('*')
            .eq('id', supaAuth.user.id)
            .single();

          if (roleError) {
             supaErrorMessage = "Role error: " + roleError.message;
          }

          if (!roleError && supaUser && (supaUser.role === 'admin' || supaUser.role === 'store owner' || supaUser.role === 'store_owner')) {
            const { syncService } = await import('../services/syncService');
            await syncService.init(username, password);
            await syncService.initialSync(supaUser.pharmacy_id, supaUser.branch_id || '');
            syncService.startPeriodicSync();

            // After sync, retry local login
            const retryRes = await apiFetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username, password })
            });
            let retryData: any = null;
            if (retryRes.headers.get('Content-Type')?.includes('application/json')) {
              retryData = await retryRes.json();
            }
            if (retryRes.ok && retryData?.success) {
              setUser(retryData.user);
              localStorage.setItem('store_user', JSON.stringify(retryData.user));
              setHasLoggedOut(false);
              localStorage.removeItem('has_logged_out');
              return true;
            } else {
              supaErrorMessage = retryData?.error || "Retry failed after sync";
            }
          } else if (!roleError && supaUser) {
              supaErrorMessage = "Role not authorized: " + supaUser.role;
          }
        }
      }

      // If we reach here, both local and Supabase failed (or user wasn't an admin)
      const checkRes = await apiFetch('/api/auth/has-users');
      const checkData = await checkRes.json();
      
      if (!checkData.hasUsers) {
        throw new Error("Manager or Pharmacy owner need to login first to grant you access.");
      } else {
        const cleanSupaMsg = supaErrorMessage === 'Invalid login credentials' ? '' : supaErrorMessage;
        const fallbackMsg = cleanSupaMsg ? ` | SupaFallback: ${cleanSupaMsg}` : '';
        throw new Error((data?.error ? data.error : "Invalid username or password") + fallbackMsg);
      }
    } catch (err: any) {
      console.error('Login failed', err);
      throw err; // Re-throw so Login.tsx can catch it
    } finally {
      setIsLoading(false);
    }
  };

  const checkPharmacyExists = async (pharmacyName: string): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/auth/check-pharmacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pharmacyName })
      });
      const data = await res.json();
      return data.exists;
    } catch (e) {
      return false;
    }
  };

  const checkAccountExists = async (email: string, phone: string, pharmacyName: string): Promise<{ exists: boolean, error?: string }> => {
    try {
      const res = await apiFetch('/api/auth/check-signup-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, pharmacyName })
      });
      const data = await res.json();
      return { exists: data.exists, error: data.error };
    } catch (e) {
      return { exists: false };
    }
  };

  const sendOtp = async (email: string) => {
    try {
      const res = await apiFetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      return data;
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  };

  const verifyOtp = async (code: string, userData: any) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...userData })
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        localStorage.setItem('store_user', JSON.stringify(data.user));
        setHasLoggedOut(false);
        localStorage.removeItem('has_logged_out');
        setIsLoading(false);
        return { success: true };
      }
      setIsLoading(false);
      return { success: false, error: data.error };
    } catch (e: any) {
      setIsLoading(false);
      return { success: false, error: e.message };
    }
  };

  const signup = async (
    name: string,
    phone: string,
    pharmacyName: string,
    email: string,
    country: string,
    state: string,
    city: string,
    address: string,
    password: string
  ) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, pharmacyName, email, country, state, city, address, password })
      });
      if (res.ok && res.headers.get('Content-Type')?.includes('application/json')) {
        const data = await res.json();
        if (data.success) {
          setUser(data.user);
          localStorage.setItem('store_user', JSON.stringify(data.user));
          setHasLoggedOut(false);
          localStorage.removeItem('has_logged_out');
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error('Signup failed', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Open testing mode: maintain full admin access
    setUser(DEFAULT_USER);
    localStorage.setItem('store_user', JSON.stringify(DEFAULT_USER));
    localStorage.removeItem('has_logged_out');
    setHasLoggedOut(false);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, checkPharmacyExists, checkAccountExists, sendOtp, verifyOtp, logout, isLoading, hasLoggedOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

