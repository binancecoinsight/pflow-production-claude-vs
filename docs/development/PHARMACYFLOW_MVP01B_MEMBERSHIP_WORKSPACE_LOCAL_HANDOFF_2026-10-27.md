# PharmacyFlow MVP-01B membership workspace local handoff

Date: 2026-10-27
Disposition: **LOCAL SOURCE/SYNTHETIC IMPLEMENTATION COMPLETE — INDEPENDENT REVIEW REQUIRED**

## Authorization and boundary

The owner authorized one local source/test/document batch for session-only branch selection and fail-closed membership workspace UX. The authorization excludes database or SQL execution, migrations, target inspection, credentials, network, Auth/provider/browser access, Docker/services/ports, installation, Git mutation, provisioning, cleanup, destruction, activation, deployment and StoreFlow. AUTH-02 remains deferred.

No accepted PF-SUP-17 artifact was regenerated or retested. Migrations and protected application/security contracts were not changed.

## Implemented behavior

- `membershipWorkspace.ts` centralizes the production-used active-user/membership checks, branch eligibility, branch selection, coherent-ready predicate, existing report-navigation rule and generation guard.
- Branch eligibility mirrors the existing `has_branch_access` source rule in migration `20261012000017`: OWNER/MANAGER may choose among authoritative query results for their selected pharmacy; other roles can use only a returned branch matching their `default_branch_id`.
- A membership default is not authorization. The membership must be active and bound to the current user, the pharmacy must match, and the candidate branch must have been returned for that pharmacy.
- One eligible branch auto-selects. Multiple eligible branches enter `authenticated_select_branch`; zero enter `authenticated_no_branches`. Branch selection is never written to browser storage.
- Every context resolution obtains a generation/user token. Starting selection or refresh clears the previously published workspace. Sign-out invalidates and clears it before calling the existing sign-out boundary. Late or superseded responses cannot publish.
- A completed zero-row membership lookup enters the no-membership state. Profile, membership, pharmacy, branch, permission or subscription query failure enters the separate error state.
- `App` validates a coherent ready binding before mounting the offline runtime or operational shell. Selection/loading/unavailable/error states cannot mount operational content.
- The shell preserves its existing navigation matrix and uses the centralized report rule. Its branch-change action returns to explicit selection. No server-security claim is made from hidden navigation.

## Preservation and data behavior

- The existing pharmacy preference key is unchanged and remains a convenience hint revalidated against freshly returned active memberships.
- No branch preference key or new storage behavior exists.
- The transition path performs no queue, draft, history, IndexedDB or cleanup mutation. Operational components unmount while the context is unresolved; preservation of persisted drafts/queues in a real browser is not claimed without browser acceptance.
- No privileged mutation, new adapter, RPC, schema, migration, signup, onboarding, invitation, subscription, financial, I3 or synchronization contract was added or changed.

## Executed isolated verification

1. `node --loader ./scripts/typescript-loader.mjs src/lib/auth/membershipWorkspace.test.ts`
   - PASS: `Membership workspace policy tests: 27 passed`.
   - Covers zero/one/multiple branch outcomes; non-management assignment; cross-pharmacy/default/user/inactive rejection; branch selection; pharmacy membership validation; unchanged navigation; coherent-ready validation; A→B→A; overlapping refresh; invalidation/failure; sign-out; and previous-user response rejection.
2. `node scripts/acceptance/membership-workspace-wiring.test.mjs`
   - PASS: `Membership workspace wiring tests: 22 passed`.
   - Verifies production guard/policy wiring, no branch storage, state gating, sign-out ordering, App runtime gating, navigation centralization and branch/user/membership association checks.
3. `.\\node_modules\\.bin\\tsc.cmd -p scripts/acceptance/tsconfig.membership-workspace.json --noEmit`
   - Initial run: FAIL only because the new focused config inherited browser-only ambient types while transitive `src/lib/supabase.ts` references `process`.
   - The config was corrected to include the already-installed `node` types.
   - Final run: PASS, exit code 0, no output.
4. `.\\node_modules\\.bin\\tsc.cmd --noEmit`
   - PASS, exit code 0, no output.

No browser, Auth, network, database, datastore, migration, protected acceptance or unchanged PF-SUP-17 test ran.

## Evidence limitations and remaining work

- The tests exercise the same eligibility, selection, ready-binding and generation-guard functions imported by production `AuthContext`; they do not duplicate those rules in a separate test model.
- They do not prove React scheduling/render behavior, Supabase Auth event ordering, deployed RLS, real branch visibility, browser draft/queue persistence or server authorization.
- The database schema has no branch-active status field. Local eligibility therefore filters only branches returned through the existing authoritative query and the established membership-role/default rule; it invents no additional lifecycle policy.
- Navigation visibility is UX containment only. Server-side authorization remains independently required.

## Review package

The sibling manifest `MVP01B_MEMBERSHIP_WORKSPACE_LOCAL_HANDOFF_2026-10-27.sha256` contains SHA-256 entries for only this milestone's source, tests, focused compiler config, records and this report. Historical manifests and unrelated dirty/untracked files are excluded and preserved.

Next action: independent source/synthetic review. No dependent protected implementation or execution is authorized.
