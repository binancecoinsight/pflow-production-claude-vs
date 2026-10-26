# BLK-002-I1 local authoring evidence

Date: 2026-10-25  
Input checkpoint: PF-SUP-2026-10-25-16  
Disposition: **LOCAL AUTHORING COMPLETE — INDEPENDENT REVIEW REQUIRED — DATABASE/AUTH/BROWSER ACCEPTANCE NOT VERIFIED — ROLLOUT BLOCKED**

This is a source-only handoff. It does not accept the migration, authorize a gateway, enable owner signup, provide a production provider, or grant database, Auth, deployment, rollout, M4, or MVP approval. AUTH-02 remains owner-deferred.

## Authorized scope authored

1. `supabase/migrations/20261025000028_owner_eligibility_issuer_v1.sql`
   - Adds an empty closed/manual admission ledger and an authoritative eligibility ledger.
   - Creates a `NOLOGIN NOINHERIT NOBYPASSRLS` issuer owner role.
   - Implements reservation, stable provider-operation correlation, activation, revocation/replacement and typed conflicts.
   - Replaces the existing OWNER RPC only in this additive migration so ACTIVE eligibility is locked and consumed atomically with tenant, branch, trial subscription, OWNER membership and completion evidence.
   - Allows an exact completed CONSUMED replay for the same subject, request and fingerprint without new effects.
   - Deliberately grants no caller execute privilege on private issuer functions. Gateway identity remains unresolved and denied.
2. `supabase/functions/owner-eligibility-issuer/index.ts`
   - Defines only injected repository and Auth-provider boundaries.
   - Requires authoritative manual admission before any provider call.
   - Denies existing confirmed and staff-bootstrap identities without metadata mutation.
   - Recovers ambiguous Auth creation only by the immutable provider-operation ID.
   - Has no server entry point, environment adapter, Supabase client or production provider.
3. `supabase/functions/owner-eligibility-issuer/index.test.ts`
   - Exercises admission denial with zero provider calls, changed inputs, exact issue retry, existing-identity non-mutation, exact-operation ambiguity recovery, continuation recovery and forged-marker activation denial.
4. `supabase/contracts/owner_eligibility_issuer_v1.test.ts`
   - Statically inspects the additive SQL and injected boundary.
   - Uses an explicitly synchronous model for cross-subject denial, fingerprint/marker conflicts, exact CONSUMED replay, revoke/consume ordering, replacement and rollback after each modeled tenant effect.

No sealed migration, M-16, M-18, Refund V2, status-v2, prior reviewed manifest or existing application source was changed in this batch. Owner signup remains disabled because this batch adds no client integration or production adapter.

## Fresh permitted checks

Only the two new focused files were run with the repository's existing TypeScript loader:

- Injected issuer boundary: 17 assertions passed.
- Static/synchronous contract model: 35 assertions passed.
- PostgreSQL concurrency and rollback: not run; the interleavings and staged rollback checks are models, not database evidence.

No database, migration, Auth provider, network, Docker, service, port, browser storage, installation, Git mutation, deployment or StoreFlow operation occurred.

## Unresolved privilege and policy questions

1. The migration executor must be proven able to create the two `NOLOGIN` roles in sequence, grant/alter ownership, create policies/triggers/functions, and grant the exact `auth.users` columns. Abort if any role already exists without the expected attributes/ownership, if the executor lacks ownership or grant options, or if execution would require a broader runtime role.
2. Effective PostgreSQL behavior for FORCE RLS, SECURITY DEFINER ownership, `auth.uid()`, column-level grants, existing PUBLIC policies and trigger execution is unverified. Source/model success is not acceptance evidence.
3. The future gateway identity and authentication mechanism are unresolved. Private issuer functions have no gateway execute grant; `service_role` is explicitly revoked and must not be substituted.
4. The operational actor and audited mechanism that inserts, revokes, or replaces closed manual admissions remain unspecified. The allowlist is empty and issuance is therefore unavailable by default.
5. Availability and EXECUTE/schema resolution for `digest`, `encode`, `convert_to` and `gen_random_uuid`, plus managed-platform permission to create roles and change ownership, require real acceptance in an authorized disposable environment.
6. Real Auth semantics for email uniqueness, trusted application-metadata compare-and-set, confirmation observation and exact provider-operation recovery remain unverified.
7. SQL transaction serialization, concurrent exact retry, failure after each tenant effect and canonical replay require future real PostgreSQL acceptance. Browser recovery and rollout remain blocked.

## Preserved evidence and review gate

- Reviewed design manifest remains unchanged: `BLK002_DESIGN_HANDOFF_MANIFEST_PF-SUP-2026-10-25-15.sha256` (manifest SHA-256 `4628f7f3e5fa612b85716720ef9e90e21874574fe221c63575fc5e177aafbd5a`).
- Reviewed correction manifest remains unchanged: `BLK002_CORRECTION_MANIFEST_2026-10-25.sha256` (manifest SHA-256 `2e6f268d4f0f3c9cb57007723482c951b8ecacf96e5853cbfb60a375d55b2398`).
- The separately named BLK-002-I1 manifest covers only this source handoff.

Next gate: independently review the exact BLK-002-I1 manifest and sources for closed-admission ordering, immutable bindings, provider recovery, SQL atomicity, RLS/ACL minimization, absence of gateway authority, and preservation of sealed contracts. Stop before any gateway/provider authoring, database execution, Auth call, client enablement, rollout or dependent protected implementation.
