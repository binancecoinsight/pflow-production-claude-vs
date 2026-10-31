# PharmacyFlow MVP-01B publication-boundary correction

Checkpoint: PF-SUP-2026-10-27-03

Date: 2026-10-27

Disposition: **LOCAL SOURCE/SYNTHETIC CORRECTION COMPLETE — INDEPENDENT REVIEW REQUIRED**

## Authorization and preservation

The owner authorized one bounded local coordination/AuthContext/test/document correction. No actual Auth/provider/browser, database/SQL, network, credentials, Docker/services/ports, installation, Git mutation, provisioning, cleanup, destruction, activation, deployment or StoreFlow access was authorized. AUTH-02 remains deferred.

The accepted PF-SUP-02 session coordinator, branch eligibility, session-only selection, navigation entitlements, existing pharmacy-hint storage behavior, drafts, queues, historical records and protected contracts are unchanged. Earlier reports and manifests remain historical evidence; this package is additive.

## Demonstrated defect

`waitForCurrent` checked generation and current-user binding after its awaited load, then returned a `current` result. The awaiting `AuthContext` caller resumed in a later microtask and treated that earlier result as continuing freshness. An invalidation scheduled between the helper's check and the caller continuation could therefore allow stale setters, ready/selection/unavailable/no-membership state, or the pharmacy preference hint to publish.

The same gap could allow an already-superseded continuation to begin its next database query before learning that a later helper result was stale.

## Correction

`WorkspaceRequestGuard` now provides two distinct boundaries:

- `waitForCurrent` checks freshness before invoking a loader, then checks again when it settles. Work already superseded at the query boundary starts zero loads.
- `publishIfCurrent` rechecks generation and current-user binding and executes its callback synchronously in the same JavaScript turn. The callback contains no await.

`AuthContext` uses explicit caller-side checks before profile, membership, pharmacy and activation query boundaries. It also rechecks before invoking activation after membership/pharmacy resolution.

The following publications are completely enclosed by `publishIfCurrent`:

1. coherent ready workspace;
2. explicit multi-branch selection state;
3. no-eligible-branches unavailable state;
4. confirmed no-membership state;
5. multiple-pharmacy selection state;
6. branch selection completion;
7. resolution-error publication.

The activation callback includes all profile, memberships, membership, pharmacy, branches, branch, role, permissions, subscription and error setters; pending-branch token assignment; final session state; and the pre-existing `LAST_PHARMACY_KEY` hint write. There is no await between its final freshness validation and any of those effects.

## Deterministic microtask regression

`publicationBoundary.test.ts` uses the exact production `WorkspaceRequestGuard`. For each stale case it:

1. lets `waitForCurrent` complete its internal current check;
2. registers invalidation as the first reaction to the helper result;
3. resumes the simulated awaiting caller in the following microtask;
4. calls the same production `publishIfCurrent` boundary used by `AuthContext`.

The cases prove:

- sign-out between helper check and caller continuation publishes zero ready state, workspace data or preference;
- newer pharmacy/branch selection publishes zero stale branch-selection state or preference;
- refresh publishes zero stale unavailable state or preference;
- identity change publishes zero stale no-membership state or preference;
- a request superseded before a query boundary starts zero loads;
- invalidation before the caller's next-query check starts zero subsequent loads;
- normal current ready, branch-selection, unavailable and no-membership publications still succeed with unchanged preference behavior.

## Executed isolated verification

1. `node --loader ./scripts/typescript-loader.mjs src/lib/auth/publicationBoundary.test.ts`
   - PASS: `MVP-01B publication boundary tests: 22 passed`.
2. `node --loader ./scripts/typescript-loader.mjs src/lib/auth/sessionTransition.test.ts`
   - PASS: `MVP-01B session transition tests: 20 passed`.
3. `node --loader ./scripts/typescript-loader.mjs src/lib/auth/membershipWorkspace.test.ts`
   - PASS: `Membership workspace policy tests: 27 passed`.
4. `node scripts/acceptance/membership-workspace-wiring.test.mjs`
   - PASS: `Membership workspace wiring tests: 40 passed`.
   - Static checks require guarded publication for all outcome paths, pre-query caller checks, preference containment and no await in the activation publication callback.
5. `.\\node_modules\\.bin\\tsc.cmd -p scripts/acceptance/tsconfig.membership-workspace.json --noEmit`
   - PASS, exit code 0, no output.
6. `.\\node_modules\\.bin\\tsc.cmd --noEmit`
   - PASS, exit code 0, no output.

No browser, actual Supabase Auth/provider, database, RLS, network, storage, migration, protected acceptance or external operation ran. No PF-SUP-17 suite was rerun.

## Evidence limitations and next gate

The tests prove deterministic local microtask ordering and synchronous publication containment with production-used helpers. They do not prove Supabase callback timing, React/browser rendering, browser draft persistence, deployed RLS or production behavior.

The only next action is independent review of this additive report and scoped SHA-256 manifest. No dependent implementation or protected execution is authorized.
