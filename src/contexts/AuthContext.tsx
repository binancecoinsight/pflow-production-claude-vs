import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AuthContextValue, SessionState, MembershipWithPharmacy } from '../types/auth';
import { UserProfile, PharmacyMember, Pharmacy, Branch, UserRole, Subscription } from '../types/database';
import {
  acceptStaffInvitationWithRpc,
  beginOwnerRegistration,
  createOwnerOnboardingIntent,
  createOwnerPharmacyWithRpc,
  DEFAULT_OWNER_ONBOARDING_DEPLOYMENT,
  readOwnerOnboardingIntent,
} from '../lib/auth/onboarding';
import {
  WorkspaceRequestGuard,
  WorkspaceRequestToken,
  isMembershipSelectionCurrent,
  resolveEligibleBranches,
  selectEligibleBranch,
  selectMembershipForPharmacy,
} from '../lib/auth/membershipWorkspace';
import {
  AuthSessionTransitionCoordinator,
  SessionTransitionEffects,
} from '../lib/auth/sessionTransition';

const LAST_PHARMACY_KEY = 'pharmacyflow.selected_pharmacy_id';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SessionState>('initializing');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithPharmacy[]>([]);
  const [membership, setMembership] = useState<PharmacyMember | null>(null);
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(new WorkspaceRequestGuard());
  const sessionCoordinatorRef = useRef(new AuthSessionTransitionCoordinator<User>());
  const currentUserIdRef = useRef<string | null>(null);
  const pendingBranchTokenRef = useRef<WorkspaceRequestToken | null>(null);

  const clearResolvedWorkspace = useCallback((nextState: SessionState) => {
    pendingBranchTokenRef.current = null;
    setProfile(null);
    setMemberships([]);
    setMembership(null);
    setPharmacy(null);
    setBranches([]);
    setBranch(null);
    setRole(null);
    setPermissions([]);
    setSubscription(null);
    setError(null);
    setState(nextState);
  }, []);

  const publishResolutionError = useCallback((request: WorkspaceRequestToken, message: string) => {
    requestGuardRef.current.publishIfCurrent(request, () => currentUserIdRef.current, () => {
      clearResolvedWorkspace('authenticated_error');
      setError(message);
    });
  }, [clearResolvedWorkspace]);

  /**
   * Activates a specific verified membership, resolving branch, permissions, and subscription.
   */
  const activateMembership = useCallback(async (
    authUser: User,
    selectedMember: MembershipWithPharmacy,
    resolvedMemberships: MembershipWithPharmacy[],
    resolvedProfile: UserProfile | null,
    request: WorkspaceRequestToken,
  ) => {
    try {
      if (!requestGuardRef.current.isCurrent(request, currentUserIdRef.current)) return;
      const selectedPharmacy = selectedMember.pharmacy;
      if (!selectedPharmacy
          || !isMembershipSelectionCurrent(resolvedMemberships, authUser.id, selectedMember)) {
        throw new Error('Selected pharmacy is not backed by a current active membership.');
      }

      const userRole = selectedMember.role;
      if (!requestGuardRef.current.isCurrent(request, currentUserIdRef.current)) return;
      const activationResult = await requestGuardRef.current.waitForCurrent(
        request,
        () => currentUserIdRef.current,
        () => Promise.all([
          supabase.from('branches').select('*').eq('pharmacy_id', selectedMember.pharmacy_id),
          supabase.from('role_permissions').select('permission').eq('role', userRole),
          supabase.from('subscriptions').select('*').eq('pharmacy_id', selectedMember.pharmacy_id).maybeSingle(),
        ]),
      );
      if (activationResult.status === 'superseded') return;
      if (activationResult.status === 'failed') throw activationResult.error;
      const [branchResponse, permissionResponse, subscriptionResponse] = activationResult.value;
      if (branchResponse.error) throw new Error(`Failed to resolve eligible branches: ${branchResponse.error.message}`);
      if (permissionResponse.error) throw new Error(`Failed to resolve role permissions: ${permissionResponse.error.message}`);
      if (subscriptionResponse.error) throw new Error(`Failed to resolve subscription context: ${subscriptionResponse.error.message}`);

      const branchResolution = resolveEligibleBranches(
        authUser.id,
        selectedMember,
        selectedPharmacy,
        (branchResponse.data || []) as Branch[],
      );
      const loadedPermissions = (permissionResponse.data || []).map((p: { permission: string }) => p.permission);

      requestGuardRef.current.publishIfCurrent(request, () => currentUserIdRef.current, () => {
        // Publication and the existing preference hint write are one guarded,
        // synchronous operation. No freshness decision survives an await.
        setProfile(resolvedProfile);
        setMemberships(resolvedMemberships);
        setMembership(selectedMember);
        setPharmacy(selectedPharmacy);
        setBranches([...branchResolution.branches]);
        setBranch(branchResolution.kind === 'ready' ? branchResolution.branch : null);
        setRole(userRole);
        setPermissions(loadedPermissions);
        setSubscription((subscriptionResponse.data || null) as Subscription | null);
        setError(null);

        try {
          // Existing pharmacy preference is only a hint and was revalidated above.
          localStorage.setItem(LAST_PHARMACY_KEY, selectedMember.pharmacy_id);
        } catch {
          // Safe to ignore in private browsing modes.
        }

        if (branchResolution.kind === 'selection_required') {
          pendingBranchTokenRef.current = request;
          setState('authenticated_select_branch');
        } else if (branchResolution.kind === 'unavailable') {
          pendingBranchTokenRef.current = null;
          setState('authenticated_no_branches');
        } else {
          pendingBranchTokenRef.current = null;
          setState('authenticated_ready');
        }
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to activate pharmacy session.';
      publishResolutionError(request, message);
    }
  }, [publishResolutionError]);

  /**
   * Authoritatively resolves all active pharmacy memberships from the database.
   */
  const resolveSessionContext = useCallback(async (authUser: User) => {
    if (currentUserIdRef.current !== authUser.id) return;
    const request = requestGuardRef.current.begin(authUser.id);
    clearResolvedWorkspace('authenticated_loading');

    try {
      // 1. Resolve User Profile from public.user_profiles
      if (!requestGuardRef.current.isCurrent(request, currentUserIdRef.current)) return;
      const profileResult = await requestGuardRef.current.waitForCurrent(
        request,
        () => currentUserIdRef.current,
        () => supabase.from('user_profiles').select('*').eq('id', authUser.id).maybeSingle(),
      );
      if (profileResult.status === 'superseded') return;
      if (profileResult.status === 'failed') throw profileResult.error;
      const { data: profileData, error: profileErr } = profileResult.value;
      if (profileErr) throw new Error(`Failed to resolve user profile: ${profileErr.message}`);

      // 2. Query ALL Active Pharmacy Memberships for this User
      if (!requestGuardRef.current.isCurrent(request, currentUserIdRef.current)) return;
      const membershipResult = await requestGuardRef.current.waitForCurrent(
        request,
        () => currentUserIdRef.current,
        () => supabase
          .from('pharmacy_members')
          .select('*')
          .eq('user_id', authUser.id)
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: false }),
      );
      if (membershipResult.status === 'superseded') return;
      if (membershipResult.status === 'failed') throw membershipResult.error;
      const { data: memberRows, error: memberErr } = membershipResult.value;

      if (memberErr) {
        throw new Error('Failed to resolve pharmacy memberships: ' + memberErr.message);
      }
      if (!memberRows || memberRows.length === 0) {
        requestGuardRef.current.publishIfCurrent(request, () => currentUserIdRef.current, () => {
          setProfile(profileData || null);
          setMemberships([]);
          setState('authenticated_no_membership');
        });
        return;
      }

      // 3. Query All Associated Pharmacy Entities
      const pharmacyIds = memberRows.map((m: PharmacyMember) => m.pharmacy_id);
      if (!requestGuardRef.current.isCurrent(request, currentUserIdRef.current)) return;
      const pharmacyResult = await requestGuardRef.current.waitForCurrent(
        request,
        () => currentUserIdRef.current,
        () => supabase.from('pharmacies').select('*').in('id', pharmacyIds),
      );
      if (pharmacyResult.status === 'superseded') return;
      if (pharmacyResult.status === 'failed') throw pharmacyResult.error;
      const { data: pharmacyRows, error: pharmacyErr } = pharmacyResult.value;

      if (pharmacyErr) {
        throw new Error('Failed to load pharmacy details: ' + pharmacyErr.message);
      }
      const pharmacyMap = new Map((pharmacyRows || []).map((p: Pharmacy) => [p.id, p]));
      const enrichedMemberships: MembershipWithPharmacy[] = memberRows.map((m: PharmacyMember) => ({
        ...m,
        pharmacy: pharmacyMap.get(m.pharmacy_id)
      }));
      if (enrichedMemberships.some((candidate) => !candidate.pharmacy)) {
        throw new Error('An active membership references an unavailable pharmacy.');
      }

      // 4. Determine Active Pharmacy Selection
      if (enrichedMemberships.length === 1) {
        // Exactly one membership: automatically select it
        if (!requestGuardRef.current.isCurrent(request, currentUserIdRef.current)) return;
        await activateMembership(authUser, enrichedMemberships[0], enrichedMemberships, profileData || null, request);
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
          if (!requestGuardRef.current.isCurrent(request, currentUserIdRef.current)) return;
          await activateMembership(authUser, matchingMember, enrichedMemberships, profileData || null, request);
        } else {
          // Require explicit selection by the user
          requestGuardRef.current.publishIfCurrent(request, () => currentUserIdRef.current, () => {
            setProfile(profileData || null);
            setMemberships(enrichedMemberships);
            setState('authenticated_select_pharmacy');
          });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred resolving tenant context.';
      publishResolutionError(request, message);
    }
  }, [activateMembership, clearResolvedWorkspace, publishResolutionError]);

  const sessionEffects = useMemo<SessionTransitionEffects<User>>(() => ({
    invalidateWorkspace: () => requestGuardRef.current.invalidate(),
    publishIdentity: (nextUser) => {
      currentUserIdRef.current = nextUser.id;
      setUser(nextUser);
    },
    clearIdentity: () => {
      currentUserIdRef.current = null;
      setUser(null);
      clearResolvedWorkspace('unauthenticated');
    },
    resolveWorkspace: resolveSessionContext,
  }), [clearResolvedWorkspace, resolveSessionContext]);

  // Initialize and listen to Supabase Auth lifecycle
  useEffect(() => {
    let isMounted = true;

    if (!isSupabaseConfigured()) {
      setState('unauthenticated');
      return;
    }

    const initialSessionToken = sessionCoordinatorRef.current.beginInitialSessionRead();

    // 1. Initial Session Check on Startup. An auth event invalidates this
    // result so a late getSession response cannot restore an older identity.
    supabase.auth.getSession().then(async ({ data: { session }, error: sessionErr }) => {
      if (!isMounted) return;
      if (sessionErr) {
        console.warn('[PharmacyFlow Auth] Initial getSession error:', sessionErr.message);
        await sessionCoordinatorRef.current.completeInitialSession(initialSessionToken, null, sessionEffects);
        return;
      }
      await sessionCoordinatorRef.current.completeInitialSession(initialSessionToken, session?.user || null, sessionEffects);
    }).catch(() => {
      if (isMounted) void sessionCoordinatorRef.current.completeInitialSession(initialSessionToken, null, sessionEffects);
    });

    // 2. Auth State Change Listener
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        await sessionCoordinatorRef.current.applyAuthEvent(
          event === 'SIGNED_OUT' || !session?.user ? null : session.user,
          sessionEffects,
        );
      }
    );

    return () => {
      isMounted = false;
      authListener.unsubscribe();
    };
  }, [sessionEffects]);

  /**
   * Switches the active session to another verified membership.
   */
  const selectPharmacy = useCallback(async (pharmacyId: string) => {
    if (!user || currentUserIdRef.current !== user.id) return;
    const resolvedMemberships = memberships;
    const resolvedProfile = profile;
    const targetMember = selectMembershipForPharmacy(resolvedMemberships, user.id, pharmacyId);
    const request = requestGuardRef.current.begin(user.id);
    clearResolvedWorkspace('authenticated_loading');
    if (!targetMember) {
      publishResolutionError(request, 'Selected pharmacy is not backed by a current active membership.');
      return;
    }
    await activateMembership(user, targetMember, resolvedMemberships, resolvedProfile, request);
  }, [activateMembership, clearResolvedWorkspace, memberships, profile, publishResolutionError, user]);

  const selectBranch = useCallback((branchId: string) => {
    const request = pendingBranchTokenRef.current;
    if (!request || !requestGuardRef.current.isCurrent(request, currentUserIdRef.current)
        || !user || !membership || !pharmacy) return;
    const selected = selectEligibleBranch(user.id, membership, pharmacy, branches, branchId);
    if (!selected) {
      publishResolutionError(request, 'Selected branch is not eligible for the current active membership.');
      return;
    }
    requestGuardRef.current.publishIfCurrent(request, () => currentUserIdRef.current, () => {
      pendingBranchTokenRef.current = null;
      setBranch(selected);
      setError(null);
      setState('authenticated_ready');
    });
  }, [branches, membership, pharmacy, publishResolutionError, user]);

  const requestBranchSelection = useCallback(() => {
    if (!user || !membership || !pharmacy || branches.length < 2
        || currentUserIdRef.current !== user.id) return;
    const request = requestGuardRef.current.begin(user.id);
    pendingBranchTokenRef.current = request;
    setBranch(null);
    setError(null);
    setState('authenticated_select_branch');
  }, [branches, membership, pharmacy, user]);

  /**
   * Refreshes the active database context for the authenticated user.
   */
  const refreshContext = useCallback(async () => {
    if (user) {
      await resolveSessionContext(user);
    }
  }, [user, resolveSessionContext]);

  /** Explicit recovery only; normal session loading never creates a tenant. */
  const recoverOwnerOnboarding = useCallback(async (): Promise<{ error: Error | null }> => {
    if (!user) return { error: new Error('Sign in before recovering owner onboarding.') };
    if (!user.email_confirmed_at) return { error: new Error('Verify the account email before recovering owner onboarding.') };
    const intent = readOwnerOnboardingIntent(user.user_metadata);
    if (!intent) return { error: new Error('No valid owner onboarding request is attached to this identity.') };
    const outcome = await createOwnerPharmacyWithRpc(
      intent,
      (arguments_) => supabase.rpc('rpc_create_pharmacy_owner_v1', arguments_),
    );
    if (outcome.error) return { error: new Error(`[${outcome.error.code}] ${outcome.error.message}`) };
    await resolveSessionContext(user);
    return { error: null };
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

    const attempt = sessionCoordinatorRef.current.beginSignIn();
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (authError) {
        sessionCoordinatorRef.current.failSignIn(attempt);
        return { error: authError };
      }

      if (!data.user) {
        sessionCoordinatorRef.current.failSignIn(attempt);
        return { error: new Error('Sign-in completed without an authenticated identity.') };
      }
      const outcome = await sessionCoordinatorRef.current.completeSignIn(attempt, data.user, sessionEffects);
      if (outcome === 'superseded') {
        return { error: new Error('Sign-in attempt was superseded by a newer session transition.') };
      }

      return { error: null };
    } catch (err: unknown) {
      sessionCoordinatorRef.current.failSignIn(attempt);
      return { error: err instanceof Error ? err : new Error('Sign-in failed.') };
    }
  }, [sessionEffects]);

  /** Disabled until a separately reviewed trusted owner-identity provider exists. */
  const signUp = useCallback(async (
    email: string,
    password: string,
    fullName: string,
    pharmacyName: string
  ): Promise<{ error: Error | null; requiresEmailConfirmation: boolean }> => {
    try {
      if (!globalThis.crypto?.randomUUID) {
        return { error: new Error('Secure request identity generation is unavailable; registration failed closed.'), requiresEmailConfirmation: false };
      }
      const intent = createOwnerOnboardingIntent(pharmacyName, globalThis.crypto.randomUUID());
      const outcome = await beginOwnerRegistration(
        { email, password, fullName, pharmacyName },
        intent,
        DEFAULT_OWNER_ONBOARDING_DEPLOYMENT,
        null,
      );
      return {
        error: outcome.error ? new Error(`[${outcome.error.code}] ${outcome.error.message}`) : null,
        requiresEmailConfirmation: outcome.requiresEmailConfirmation,
      };
    } catch (err: unknown) {
      return {
        error: err instanceof Error ? err : new Error('Owner registration failed closed.'),
        requiresEmailConfirmation: false,
      };
    }
  }, []);

  const acceptStaffInvitation = useCallback(async (invitationId: string, rawToken: string): Promise<{ error: Error | null }> => {
    try {
      const outcome = await acceptStaffInvitationWithRpc(
        { invitationId, rawToken },
        (arguments_) => supabase.rpc('rpc_accept_staff_invitation', arguments_),
      );
      if (outcome.error || !outcome.data) return { error: new Error(outcome.error || 'Invitation acceptance failed.') };
      await refreshContext();
      return { error: null };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err : new Error('Invitation acceptance failed.') };
    }
  }, [refreshContext]);

  /**
   * Signs out the active user and clears all in-memory session states.
   */
  const signOut = useCallback(async () => {
    // Invalidate and unmount operational content before the external sign-out
    // request. A late workspace response cannot republish this identity.
    sessionCoordinatorRef.current.cancelSession(sessionEffects);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[PharmacyFlow Auth] SignOut error:', err);
    }
  }, [sessionEffects]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    user,
    profile,
    memberships,
    membership,
    pharmacy,
    branches,
    branch,
    role,
    permissions,
    subscription,
    error,
    signIn,
    signUp,
    recoverOwnerOnboarding,
    acceptStaffInvitation,
    signOut,
    selectPharmacy,
    selectBranch,
    requestBranchSelection,
    refreshContext
  }), [
    state,
    user,
    profile,
    memberships,
    membership,
    pharmacy,
    branches,
    branch,
    role,
    permissions,
    subscription,
    error,
    signIn,
    signUp,
    recoverOwnerOnboarding,
    acceptStaffInvitation,
    signOut,
    selectPharmacy,
    selectBranch,
    requestBranchSelection,
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
