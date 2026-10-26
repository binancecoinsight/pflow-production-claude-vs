# BLK-002-I1 correction evidence

Date: 2026-10-25  
Input checkpoint: PF-SUP-2026-10-25-17  
Disposition: **LOCAL CORRECTION AUTHORED — INDEPENDENT REVIEW REQUIRED — DATABASE/AUTH/BROWSER ACCEPTANCE NOT VERIFIED — ROLLOUT BLOCKED**

This correction is source-only. It does not authorize migration execution, a gateway identity, provider installation, Auth access, signup enablement, database/browser acceptance, deployment, rollout, M4 or MVP completion. AUTH-02 remains owner-deferred.

## Corrections authored

1. The injected issuer now branches on authoritative state. Only `RESERVED` requests call the Auth-pending transition. Exact `EMAIL_CONFIRMATION_PENDING` retry returns without provider work; unauthenticated `ACTIVE`/`CONSUMED` retry requires the explicit authenticated recovery path.
2. Trusted authority comparison is typed and field-explicit. Identity class, issuer version, OWNER version, request ID, provider-operation ID and fingerprint are required; object key order and unrelated metadata do not affect the result.
3. Confirmed continuation after Auth creation and failed database correlation uses authenticated subject plus exact provider-operation recovery. It never discovers that identity by email, changes staff metadata or trusts client classification.
4. The injected repository contract returns every state transition and validates immutable request, provider-operation, fingerprint, admission-evidence and subject/state bindings. Its model rejects stale backward transitions.
5. Forward-only, unexecuted migration `20261025000029_owner_eligibility_recovery_v1.sql` preserves reviewed `000028`. It serializes first reservation by request then email advisory locks, returns typed request/open-email conflicts, preserves admission evidence on exact retry, adds exact private read/authenticated recovery functions, strengthens marker version checks and adds version-bound RLS consumption checks.
6. Private gateway EXECUTE grants remain absent. All private functions explicitly revoke `PUBLIC`, `anon`, `authenticated` and `service_role`; broad service-role substitution remains prohibited.

## Executed synthetic/static results

- `owner-eligibility-issuer/index.test.ts`: **39 passed** using injected in-memory dependencies.
- `owner_eligibility_issuer_v1.test.ts`: **53 passed** using static source assertions and a synchronous transaction model.
- Focused local TypeScript check over the issuer boundary and its two tests: **passed** with the repository's installed compiler.

The focused cases cover pending retry without regression/provider calls, reordered equivalent markers, altered/missing authority fields, exact and competing reservations, reservation/provider/correlation response loss, restart, the Auth-created/correlation-failed/confirmed sequence, authenticated exact-operation recovery, existing confirmed/staff non-mutation, stale/revoked denial, and exact ACTIVE/CONSUMED recovery.

## SQL source reasoning only

The SQL source contains request-then-email transaction advisory locks, row locks for state changes, monotonic transitions inherited from `000028`, typed conflict codes, exact marker/version predicates, subject-bound `auth.uid()` recovery, and no new gateway grant. These observations do not establish that PostgreSQL will compile or execute the migration, that lock interleavings are correct in a live engine, or that effective RLS/ACL behavior matches the source model.

## Unexecuted evidence and unresolved authority

1. PostgreSQL parsing, migration ordering, extension/function availability, advisory-lock behavior, concurrent first reservation, exact retry, rollback and deadlock behavior are unexecuted.
2. Effective `SECURITY DEFINER`, FORCE RLS, policy subquery, `auth.uid()`, function ownership, default ACL and column-grant behavior remain unverified.
3. The gateway identity and its authentication mechanism remain unresolved. No private issuer function is callable by a gateway in this snapshot.
4. A future provider must guarantee idempotent create/recover correlation by provider-operation ID and independently authenticate the recovery subject. Email lookup alone is prohibited.
5. The audited operational identity/process for admission, revocation and replacement remains unspecified. Existing exact reservations retain immutable admission evidence; explicit eligibility revocation is required to terminate one.
6. Real Auth confirmation races, application-metadata compare-and-set, browser restart/session behavior and rollout remain unverified. Owner signup and production providers remain disabled.

## Independent-review gate

Review the separate correction manifest and exact sources for monotonic state branching, marker comparison completeness, authenticated recovery, competing-reservation serialization, forward migration safety, policy/privilege effects and preservation of all reviewed artifacts. Do not begin gateway/provider implementation, protected execution or dependent work until that review supplies a new explicit disposition and any later scope is separately authorized.
