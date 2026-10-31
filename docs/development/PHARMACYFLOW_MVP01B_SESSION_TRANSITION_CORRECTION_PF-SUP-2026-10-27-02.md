# PharmacyFlow MVP-01B session-transition correction

Checkpoint: PF-SUP-2026-10-27-02

Date: 2026-10-27

Disposition: **LOCAL SOURCE/SYNTHETIC CORRECTION COMPLETE — INDEPENDENT REVIEW REQUIRED**

## Authorization and preservation

The owner authorized one bounded local AuthContext, production coordination helper, test and documentation correction. No actual Auth/provider/browser, database/SQL, network, credentials, Docker/services/ports, installation, Git mutation, provisioning, cleanup, destruction, activation, deployment or StoreFlow access was authorized. AUTH-02 remains deferred.

The accepted branch eligibility, session-only branch selection and navigation-entitlement behavior is unchanged. No provider contract, adapter, storage behavior, migration, draft, queue, historical record, onboarding, invitation, I3, financial or synchronization contract was changed. The original MVP-01B handoff and manifest are preserved as historical evidence; this report and its sibling manifest are additive.

## Demonstrated defect and correction

The prior `signInWithPassword` completion directly assigned `currentUserIdRef` and React `user` before coordinating that result with sign-out, newer sign-in attempts or identity-changing Auth events. Workspace-generation checks could prevent some late workspace data, but they could not undo publication of the stale identity itself.

`AuthSessionTransitionCoordinator` now owns authentication attempt and session generations:

- sign-in attempts receive immutable attempt/session tokens before provider work;
- initial-session reads are bound to both the current attempt and session generations;
- provider Auth events advance both generations and supersede pending provider/initial responses;
- sign-out cancels the session before calling the existing provider sign-out boundary;
- freshness is decided before any identity effect;
- workspace invalidation occurs before identity publication or clearing;
- workspace resolution begins only after the selected identity is adopted;
- an Auth event arriving before its matching sign-in result publishes once, while the matching result returns `already_current` without duplicate identity or workspace publication;
- a result arriving before its Auth event is valid, but the later event invalidates the first workspace generation so only the current resolution can publish;
- missing-user and failed sign-in outcomes fail closed without establishing identity.

The existing `WorkspaceRequestGuard` now exposes `waitForCurrent`, which production query paths use for profile, membership, pharmacy, branch, permission and subscription awaits. A superseded or cancelled continuation cannot proceed to publication; a rejection after cancellation is classified as superseded rather than publishing a stale error state.

## Deferred-response regression coverage

`sessionTransition.test.ts` uses the exact coordinator and workspace guard imported by `AuthContext`, with injected deferred provider and workspace promises. It covers:

1. sign-in response after sign-out: superseded, zero identity publications, zero workspace starts;
2. older sign-in after a newer user/session: only the newer identity publishes;
3. late initial-session response after an identity-changing Auth event: no old identity/workspace restoration;
4. overlapping refresh and pharmacy selection: only the newest selection continuation publishes;
5. Auth-event-first normal sign-in: one identity and one resolution, matching result is a no-op;
6. result-first normal sign-in: later Auth event suppresses the earlier deferred workspace publication;
7. sign-in failure and cancelled rejected workspace load: no stale identity, workspace or failure publication.

The static contract additionally rejects direct `setUser(data.user)` and `currentUserIdRef.current = data.user.id` publication in the sign-in completion path, and verifies coordinator ordering and use at initial-session, Auth-event and sign-out boundaries.

## Executed isolated verification

1. `node --loader ./scripts/typescript-loader.mjs src/lib/auth/sessionTransition.test.ts`
   - PASS: `MVP-01B session transition tests: 20 passed`.
2. `node --loader ./scripts/typescript-loader.mjs src/lib/auth/membershipWorkspace.test.ts`
   - PASS: `Membership workspace policy tests: 27 passed`.
   - This confirms the preserved branch/navigation policy after the shared guard extension; no PF-SUP-17 test was rerun.
3. `node scripts/acceptance/membership-workspace-wiring.test.mjs`
   - Initial combined run: FAIL on the obsolete assertion expecting a direct guard invalidation inside `signOut`.
   - The assertion was corrected to require `cancelSession(sessionEffects)` before `supabase.auth.signOut()` and to verify invalidation-before-clear in the coordinator.
   - Final run: PASS: `Membership workspace wiring tests: 32 passed`.
4. `.\\node_modules\\.bin\\tsc.cmd -p scripts/acceptance/tsconfig.membership-workspace.json --noEmit`
   - PASS, exit code 0, no output.
5. `.\\node_modules\\.bin\\tsc.cmd --noEmit`
   - PASS, exit code 0, no output.

No browser, actual Supabase Auth/provider, database, RLS, network, storage, migration, protected acceptance or external operation ran.

## Evidence limitations and next gate

The synthetic tests prove local orchestration and deferred-publication behavior with injected promises. They do not prove Supabase callback scheduling, React browser rendering, browser draft persistence, deployed RLS or production behavior. Hidden navigation remains UX containment rather than server authorization.

The only next action is independent review of this correction report and scoped SHA-256 manifest. No dependent implementation or protected execution is authorized.
