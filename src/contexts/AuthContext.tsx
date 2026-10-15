import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthContextValue, SessionState, MembershipWithPharmacy } from '../types/auth';
import { UserProfile, PharmacyMember, Pharmacy, Branch, UserRole, Subscription } from '../types/database';

const LAST_PHARMACY_KEY = 'pharmacyflow.selected_pharmacy_id';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SessionState>('initializing');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithPharmacy[]>([]);
  const [membership, setMembership] = useState<PharmacyMember | null>(null);
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Activates a specific verified membership, resolving branch, permissions, and subscription.
   */
  const activateMembership = useCallback(async (selectedMember: MembershipWithPharmacy) => {
    try {
      setMembership(selectedMember);
      const userRole = selectedMember.role;
      setRole(userRole);
      setPharmacy(selectedMember.pharmacy || null);

      // Save UI preference in localStorage (convenience only, never treated as authorization)
      try {
        localStorage.setItem(LAST_PHARMACY_KEY, selectedMember.pharmacy_id);
      } catch {
        // Safe to ignore in private browsing modes
      }

      // 1. Resolve Default or Main Branch for Selected Pharmacy
      let activeBranch: Branch | null = null;
      if (selectedMember.default_branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('*')
          .eq('id', selectedMember.default_branch_id)
          .maybeSingle();
        activeBranch = branchData || null;
      }

      if (!activeBranch) {
        const { data: mainBranchData } = await supabase
          .from('branches')
          .select('*')
          .eq('pharmacy_id', selectedMember.pharmacy_id)
          .eq('is_main', true)
          .maybeSingle();
        activeBranch = mainBranchData || null;
      }
      setBranch(activeBranch);

      // 2. Resolve Role Permissions for Selected Role
      const { data: permData, error: permErr } = await supabase
        .from('role_permissions')
        .select('permission')
        .eq('role', userRole);

      if (permErr) {
        console.warn('[PharmacyFlow Auth] Role permissions query notice:', permErr.message);
      }
      const loadedPermissions = (permData || []).map((p: { permission: string }) => p.permission);
      setPermissions(loadedPermissions);

      // 3. Resolve Subscription State for Selected Pharmacy
      const { data: subData, error: subErr } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('pharmacy_id', selectedMember.pharmacy_id)
        .maybeSingle();

      if (subErr) {
        console.warn('[PharmacyFlow Auth] Subscription query notice:', subErr.message);
      }
      setSubscription(subData || null);

      setState('authenticated_ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to activate pharmacy session.';
      setError(message);
      setState('authenticated_error');
    }
  }, []);

  /**
   * Authoritatively resolves all active pharmacy memberships from the database.
   */
  const resolveSessionContext = useCallback(async (authUser: User) => {
    setState('authenticated_loading');
    setError(null);

    try {
      // 1. Resolve User Profile from public.user_profiles
      const { data: profileData, error: profileErr } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profileErr) {
        console.warn('[PharmacyFlow Auth] Profile query notice:', profileErr.message);
      }
      setProfile(profileData || null);

      // 2. Query ALL Active Pharmacy Memberships for this User
      const { data: memberRows, error: memberErr } = await supabase
        .from('pharmacy_members')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      if (memberErr) {
        throw new Error('Failed to resolve pharmacy memberships: ' + memberErr.message);
      }

      if (!memberRows || memberRows.length === 0) {
        setMemberships([]);
        setMembership(null);
        setPharmacy(null);
        setBranch(null);
        setRole(null);
        setPermissions([]);
        setSubscription(null);
        setState('authenticated_no_membership');
        return;
      }

      // 3. Query All Associated Pharmacy Entities
      const pharmacyIds = memberRows.map((m: PharmacyMember) => m.pharmacy_id);
      const { data: pharmacyRows, error: pharmacyErr } = await supabase
        .from('pharmacies')
        .select('*')
        .in('id', pharmacyIds);

      if (pharmacyErr) {
        throw new Error('Failed to load pharmacy details: ' + pharmacyErr.message);
      }

      const pharmacyMap = new Map((pharmacyRows || []).map((p: Pharmacy) => [p.id, p]));
      const enrichedMemberships: MembershipWithPharmacy[] = memberRows.map((m: PharmacyMember) => ({
        ...m,
        pharmacy: pharmacyMap.get(m.pharmacy_id)
      }));

      setMemberships(enrichedMemberships);

      // 4. Determine Active Pharmacy Selection
      if (enrichedMemberships.length === 1) {
        // Exactly one membership: automatically select it
        await activateMembership(enrichedMemberships[0]);
      } else {
        // Multiple active memberships: check if a valid prior selection is stored in localStorage
        let preferredPharmacyId: string | null = null;
        try {
          preferredPharmacyId = localStorage.getItem(LAST_PHARMACY_KEY);
        } catch {
          // Ignore storage error
        }

        const matchingMember = preferredPharmacyId
          ? enrichedMemberships.find((m) => m.pharmacy_id === preferredPharmacyId)
          : null;

        if (matchingMember) {
          // Stored preference is verified against active database memberships
          await activateMembership(matchingMember);
        } else {
          // Require explicit selection by the user
          setState('authenticated_select_pharmacy');
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred resolving tenant context.';
      setError(message);
      setState('authenticated_error');
    }
  }, [activateMembership]);

  // Initialize and listen to Supabase Auth lifecycle
  useEffect(() => {
    let isMounted = true;

    if (!isSupabaseConfigured()) {
      setState('unauthenticated');
      return;
    }

    // 1. Initial Session Check on Startup
    supabase.auth.getSession().then(({ data: { session }, error: sessionErr }) => {
      if (!isMounted) return;
      if (sessionErr) {
        console.warn('[PharmacyFlow Auth] Initial getSession error:', sessionErr.message);
        setState('unauthenticated');
        return;
      }

      if (session && session.user) {
        setUser(session.user);
        resolveSessionContext(session.user);
      } else {
        setState('unauthenticated');
      }
    }).catch(() => {
      if (isMounted) setState('unauthenticated');
    });

    // 2. Auth State Change Listener
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        if (event === 'SIGNED_OUT' || !session || !session.user) {
          setUser(null);
          setProfile(null);
          setMemberships([]);
          setMembership(null);
          setPharmacy(null);
          setBranch(null);
          setRole(null);
          setPermissions([]);
          setSubscription(null);
          setError(null);
          setState('unauthenticated');
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setUser(session.user);
          await resolveSessionContext(session.user);
        }
      }
    );

    return () => {
      isMounted = false;
      authListener.unsubscribe();
    };
  }, [resolveSessionContext]);

  /**
   * Switches the active session to another verified membership.
   */
  const selectPharmacy = useCallback(async (pharmacyId: string) => {
    const targetMember = memberships.find((m) => m.pharmacy_id === pharmacyId);
    if (!targetMember) {
      console.warn('[PharmacyFlow Auth] Cannot switch: user is not an active member of pharmacy', pharmacyId);
      return;
    }
    setState('authenticated_loading');
    await activateMembership(targetMember);
  }, [memberships, activateMembership]);

  /**
   * Refreshes the active database context for the authenticated user.
   */
  const refreshContext = useCallback(async () => {
    if (user) {
      await resolveSessionContext(user);
    }
  }, [user, resolveSessionContext]);

  /**
   * Signs in using Supabase Auth email and password.
   */
  const signIn = useCallback(async (email: string, password: string): Promise<{ error: Error | null }> => {
    if (!isSupabaseConfigured()) {
      return {
        error: new Error(
          'Supabase credentials not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
        )
      };
    }

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (authError) {
        return { error: authError };
      }

      if (data.user) {
        setUser(data.user);
        await resolveSessionContext(data.user);
      }

      return { error: null };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err : new Error('Sign-in failed.') };
    }
  }, [resolveSessionContext]);

  /**
   * Registers a new user via Supabase Auth with full name metadata.
   */
  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName: string
  ): Promise<{ error: Error | null; requiresEmailConfirmation: boolean }> => {
    if (!isSupabaseConfigured()) {
      return {
        error: new Error(
          'Supabase credentials not configured. Please supply VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
        ),
        requiresEmailConfirmation: false
      };
    }

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim()
          }
        }
      });

      if (authError) {
        return { error: authError, requiresEmailConfirmation: false };
      }

      const requiresConfirmation = !data.session && Boolean(data.user);

      if (data.user && data.session) {
        setUser(data.user);
        await resolveSessionContext(data.user);
      }

      return { error: null, requiresEmailConfirmation: requiresConfirmation };
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err : new Error('Registration failed.'),
        requiresEmailConfirmation: false
      };
    }
  }, [resolveSessionContext]);

  /**
   * Signs out the active user and clears all in-memory session states.
   */
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[PharmacyFlow Auth] SignOut error:', err);
    } finally {
      setUser(null);
      setProfile(null);
      setMemberships([]);
      setMembership(null);
      setPharmacy(null);
      setBranch(null);
      setRole(null);
      setPermissions([]);
      setSubscription(null);
      setError(null);
      setState('unauthenticated');
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    user,
    profile,
    memberships,
    membership,
    pharmacy,
    branch,
    role,
    permissions,
    subscription,
    error,
    signIn,
    signUp,
    signOut,
    selectPharmacy,
    refreshContext
  }), [
    state,
    user,
    profile,
    memberships,
    membership,
    pharmacy,
    branch,
    role,
    permissions,
    subscription,
    error,
    signIn,
    signUp,
    signOut,
    selectPharmacy,
    refreshContext
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
