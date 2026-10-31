import { readFileSync } from 'node:fs';

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const read = (path) => readFileSync(path, 'utf8');

const context = read('src/contexts/AuthContext.tsx');
const app = read('src/App.tsx');
const shell = read('src/components/AuthenticatedShell.tsx');
const branchScreen = read('src/components/BranchSelectionScreen.tsx');
const policy = read('src/lib/auth/membershipWorkspace.ts');
const sessionTransition = read('src/lib/auth/sessionTransition.ts');

assert(context.includes('new WorkspaceRequestGuard()'), 'AuthContext uses the production generation guard');
assert(context.includes('new AuthSessionTransitionCoordinator<User>()'), 'AuthContext uses the production session transition coordinator');
assert(context.includes('completeSignIn(attempt, data.user, sessionEffects)'), 'sign-in result is coordinated before publication');
assert(!context.includes('currentUserIdRef.current = data.user.id'), 'sign-in result cannot directly publish identity');
assert(!context.includes('setUser(data.user)'), 'sign-in result cannot directly assign React identity state');
assert(context.includes('completeInitialSession(initialSessionToken'), 'initial-session response uses the same coordinator');
assert(context.includes('applyAuthEvent('), 'identity-bearing Auth events use the same coordinator');
assert(context.includes("supabase.from('branches').select('*').eq('pharmacy_id', selectedMember.pharmacy_id)"), 'branch candidates come from the selected pharmacy query');
assert(context.includes('resolveEligibleBranches('), 'AuthContext uses the shared eligibility policy');
assert(!context.includes("const LAST_BRANCH_KEY"), 'no branch preference storage key exists');
assert(!/localStorage\.(?:getItem|setItem)\([^)]*branch/i.test(context), 'no branch preference is read or written');
assert(context.includes("setState('authenticated_select_branch')"), 'multiple branches enter explicit selection state');
assert(context.includes("setState('authenticated_no_branches')"), 'zero branches enter unavailable state');
assert(context.includes("clearResolvedWorkspace('authenticated_loading')"), 'resolution clears the old workspace before requests');
assert(context.indexOf('sessionCoordinatorRef.current.cancelSession(sessionEffects)', context.indexOf('const signOut')) < context.indexOf('await supabase.auth.signOut()', context.indexOf('const signOut')), 'sign-out coordinator cancels the session before its external call');

assert(app.indexOf("state === 'authenticated_select_branch'") < app.indexOf("state === 'authenticated_ready'"), 'branch selection is handled before ready rendering');
assert(app.includes('isReadyWorkspace({'), 'App revalidates coherent bindings before mounting operational content');
assert(app.indexOf('<OfflineSyncRuntime />') > app.indexOf('isReadyWorkspace({'), 'offline runtime mounts only after coherent ready validation');
assert(branchScreen.includes('This choice is not stored.'), 'branch screen declares session-only selection');
assert(branchScreen.includes('A default branch identifier alone is not authorization.'), 'unavailable state does not elevate a default branch');
assert(!/(PosView|InventoryView|SalesView|OfflineSyncRuntime)/.test(branchScreen), 'branch selection screen cannot mount operational content');

assert(shell.includes("canViewWorkspaceTab('reports', role, permissions)"), 'shell consumes the centralized existing navigation rule');
assert(shell.includes('requestBranchSelection'), 'shell exposes explicit re-selection for multi-branch workspaces');
assert(policy.includes("membership.role === 'OWNER' || membership.role === 'MANAGER'"), 'local policy mirrors existing management branch rule');
assert(policy.includes("candidate.id === membership.default_branch_id"), 'local policy mirrors existing non-management default assignment rule');
assert(policy.includes("candidate.pharmacy_id === pharmacy.id"), 'branch association is checked locally');
assert(policy.includes("membership.user_id === currentUserId"), 'current user binding is checked locally');
assert(policy.includes("membership.status === 'ACTIVE'"), 'active membership is checked locally');
assert(policy.includes('waitForCurrent<T>'), 'workspace query continuations use the production deferred-response guard');
assert(policy.includes('publishIfCurrent('), 'workspace publication uses the synchronous production guard');
assert(policy.indexOf('if (!this.isCurrent(token, currentUserId())) return { status: \'superseded\' };') < policy.indexOf('const value = await load();'), 'already-superseded requests stop before starting a load');
assert((context.match(/publishIfCurrent\(/g) || []).length >= 5, 'all workspace outcome publications use the synchronous guard');
assert((context.match(/if \(!requestGuardRef\.current\.isCurrent\(request, currentUserIdRef\.current\)\) return;/g) || []).length >= 5, 'callers recheck freshness before subsequent query boundaries');
const activationPublishStart = context.indexOf('requestGuardRef.current.publishIfCurrent(request, () => currentUserIdRef.current, () => {', context.indexOf('const branchResolution'));
const activationPublishEnd = context.indexOf('    } catch (err: unknown) {', activationPublishStart);
const activationPublication = context.slice(activationPublishStart, activationPublishEnd);
assert(activationPublishStart >= 0 && activationPublication.includes('localStorage.setItem(LAST_PHARMACY_KEY'), 'preference write is inside guarded activation publication');
assert(!activationPublication.includes('await '), 'guarded activation publication contains no await boundary');
assert(activationPublication.includes("setState('authenticated_ready')") && activationPublication.includes("setState('authenticated_select_branch')") && activationPublication.includes("setState('authenticated_no_branches')"), 'ready, selection and unavailable states share guarded activation publication');
assert(/publishIfCurrent\(request,[\s\S]*setState\('authenticated_no_membership'\)/.test(context), 'no-membership state is synchronously guarded');
assert(sessionTransition.indexOf('effects.invalidateWorkspace();') < sessionTransition.indexOf('effects.publishIdentity(user);'), 'workspace invalidation precedes identity publication');
assert(sessionTransition.indexOf('effects.publishIdentity(user);') < sessionTransition.indexOf('await effects.resolveWorkspace(user);'), 'workspace resolution starts only after coordinated identity adoption');
assert(sessionTransition.lastIndexOf('effects.invalidateWorkspace();') < sessionTransition.lastIndexOf('effects.clearIdentity();'), 'workspace invalidation precedes identity clearing');

console.log(`Membership workspace wiring tests: ${passed} passed`);
