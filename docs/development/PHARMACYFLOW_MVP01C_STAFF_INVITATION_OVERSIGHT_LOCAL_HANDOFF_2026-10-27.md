# PharmacyFlow MVP-01C read-only staff invitation oversight

Date: 2026-10-27

Disposition: **LOCAL SOURCE/SYNTHETIC IMPLEMENTATION COMPLETE - INDEPENDENT REVIEW REQUIRED**

## Authorization and baseline

The owner authorized one bounded local source, isolated test, documentation and scoped-manifest batch. It authorizes authoring, but not executing, a runtime path to the existing `public.rpc_list_staff_invitations(UUID)` RPC. The invocation supplies only `p_pharmacy_id` from the current coherent workspace.

PF-SUP-2026-10-27-04 remains the accepted MVP-01B local source/synthetic baseline. Its artifacts and unchanged tests were not regenerated or rerun. Historical manifests, migrations, application/security work and unrelated dirty/untracked files were preserved.

No actual RPC, database/SQL, Auth/provider/browser, network, credential, Docker/service/port, installation, Git mutation, provisioning, cleanup, destruction, activation, deployment or StoreFlow operation occurred. AUTH-02 remains deferred.

## Existing contract inspected

Migration M-16 defines `rpc_list_staff_invitations(p_pharmacy_id UUID)` and returns exactly:

1. `id UUID` - non-null from the table primary key;
2. `pharmacy_id UUID` - non-null;
3. `branch_id UUID` - nullable;
4. `email TEXT` - non-null and normalized;
5. `role VARCHAR(32)` - non-null, one of `MANAGER`, `PHARMACIST`, `CASHIER`;
6. `invited_by UUID` - non-null;
7. `status VARCHAR(16)` - non-null, one of `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`;
8. `expires_at TIMESTAMPTZ` - non-null;
9. `accepted_at TIMESTAMPTZ` - nullable;
10. `created_at TIMESTAMPTZ` - non-null.

The RPC checks for an active OWNER/MANAGER membership. Client containment does not claim to replace that server check. The local path fails closed if the deployed contract is absent, errors, or returns an incompatible payload; there is no fallback query.

## Authored source

- `src/lib/auth/staffInvitationOversight.ts` defines the exact response model, strict full-response validator, coherent-workspace binding, fixed safe error messages, injected-clock expiry predicate and injected request/publication coordinator.
- `src/components/StaffInvitationOversightPanel.tsx` is a read-only panel. Its default executor calls only `rpc_list_staff_invitations` with `{ p_pharmacy_id }`; imports perform no I/O. It exposes distinct loading, empty, sanitized error and success states.
- `src/components/AuthenticatedShell.tsx` mounts the panel only on the existing overview for a coherent active OWNER/MANAGER workspace. No navigation entitlement was added or broadened.
- `src/lib/auth/staffInvitationOversight.test.ts` exercises the production-used validator and coordinator with injected executors, an injected clock and deferred promises.
- `scripts/acceptance/staff-invitation-oversight-wiring.test.mjs` statically binds the client contract to M-16 and checks containment/wiring.
- `scripts/acceptance/tsconfig.staff-invitation-oversight.json` provides the focused strict no-emit compilation boundary.

`StaffInvitationForm.tsx` and its acceptance/mutation behavior were not changed. No invitation creation/revocation, membership mutation, full roster, storage or migration source was authored.

## Validation and publication rules

The validator rejects the whole response before publication for non-array/SQL-null data; non-object rows; missing or extra fields; token/secret fields or secret-shaped values; malformed UUID, email or timestamp values; OWNER/unknown roles; unknown statuses; duplicate invitation IDs; and rows for another pharmacy. Only the ten copied fields enter state. Each row and the result array are frozen.

The server-reported `status` is never rewritten. For a server `PENDING` row only, the injected local clock may produce a separate `Time-derived: past expiry` label. The panel explicitly says this is not a server-confirmed transition.

The workspace binding includes current user, membership identity and version, pharmacy, branch and role. It is derived only from an active coherent workspace with role OWNER or MANAGER. The coordinator checks the complete binding before invoking the executor, after completion and in the same synchronous turn as its publication callback. A different load generation invalidates older work. The panel also keys rendered publication to the current binding, clears to loading synchronously on refresh, and invalidates on effect cleanup/unmount.

## Executed isolated verification

1. `node --loader ./scripts/typescript-loader.mjs src/lib/auth/staffInvitationOversight.test.ts`
   - PASS: `Staff invitation oversight tests: 41 passed`.
   - Covers workspace/role denial, exact response acceptance, immutability, null/missing/extra/secret/duplicate/cross-pharmacy rejection, injected-clock display semantics, safe errors, exact RPC arguments, empty/error/success states, cancellation, overlapping refresh and helper-completion microtask invalidation.
2. `node scripts/acceptance/staff-invitation-oversight-wiring.test.mjs`
   - PASS: `Staff invitation oversight wiring tests: 35 passed`.
3. `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.staff-invitation-oversight.json --noEmit`
   - PASS: exit code 0, no output (focused strict compilation).
4. `node node_modules/typescript/bin/tsc --noEmit`
   - PASS: exit code 0, no output (root compilation).

The first static run failed one new assertion because it expected the RPC name inside `StaffInvitationForm`, while that unchanged component correctly delegates to `AuthContext`. The assertion was corrected to verify its existing `acceptStaffInvitation(invitationId, rawToken)` boundary; the final static run passed. The initial PowerShell `npx` wrapper was blocked by local execution policy, so compilation used the same installed TypeScript compiler directly through Node. This was not an installation or external access.

No unchanged PF-SUP-17 or MVP-01B tests were rerun.

## Evidence limitations and blockers

These checks establish local TypeScript/static behavior and deterministic injected scheduling only. They do not establish that a deployed RPC exists with this signature; PostgreSQL return encoding; effective RLS/ACL; real server membership revocation timing; Supabase/Auth/network behavior; React/browser scheduling or rendering; production data correctness; or deployment compatibility.

The panel is UX containment, not authorization. Actual RPC/RLS/Auth/browser acceptance remains a separately protected gate. AUTH-02 is deferred. Full staff roster, invitation mutation and membership administration remain outside this milestone.

## Review gate

Stop for independent review of this report and `MVP01C_STAFF_INVITATION_OVERSIGHT_LOCAL_HANDOFF_2026-10-27.sha256`. No dependent implementation, protected execution, provisioning or deployment is authorized by this package.
