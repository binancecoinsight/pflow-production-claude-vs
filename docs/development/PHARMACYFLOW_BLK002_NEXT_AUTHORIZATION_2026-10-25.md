# BLK-002 next owner authorization choice

Checkpoint: **PF-SUP-2026-10-25-15**  
Current authority: design only. No issuer/provider implementation is authorized.

## Recommended smallest next batch

**BLK-002-I1 — trusted OWNER eligibility issuer/provider local authoring only.**

If approved, author only these proposed files:

1. `supabase/migrations/<approved_timestamp>_owner_eligibility_issuer_v1.sql`
2. `supabase/functions/owner-eligibility-issuer/index.ts`
3. `supabase/functions/owner-eligibility-issuer/index.test.ts`
4. `supabase/contracts/owner_eligibility_issuer_v1.test.ts`
5. a scoped progress/evidence update and new hash manifest

The Edge source must remain an injected contract with no environment adapter, `serve`, Supabase client, network or real Auth calls. Production providers remain unavailable and owner signup remains disabled.

### Proposed implementation content

- Private immutable/monotonic eligibility reservation ledger with request, intended-input fingerprint and provider-operation correlation.
- Additive SQL functions for reserve, exact replay/conflict, correlate subject, observe confirmation, activate, revoke/replace and atomic claim/consume by the existing OWNER RPC.
- Explicit server identity classifications and typed results/errors.
- Injected Auth-provider/repository interfaces modeling create, exact-operation recovery, trusted marker compare-and-set and confirmation observation.
- Focused static/in-memory tests for OI-01 through OI-17 where S/M evidence is possible; concurrency remains honestly labeled unexecuted.

### Proposed privileges

- New `pharmacyflow_owner_eligibility_issuer`: `NOLOGIN NOINHERIT NOBYPASSRLS`; owns only the private ledger and issuer functions.
- No ledger privileges for `PUBLIC`, `anon` or `authenticated`.
- Future gateway identity: execute only on named issuer functions; the identity mechanism and whether a dedicated JWT/database role can replace broad `service_role` must be independently reviewed.
- Existing `pharmacyflow_onboarding_owner`: minimum column SELECT/claim access needed to validate and consume one active eligibility inside owner creation; no Auth mutation and no global RLS bypass.
- Migration executor prerequisites and all effective ACL/policy interactions must be asserted statically and listed for later real acceptance.

### Required independent-review gate

Before any client enabling, production adapter, Auth call, SQL execution or dependent protected implementation, independently review the exact source/hash snapshot for admission-policy enforcement, ledger/RPC atomicity, provider-operation recovery, privilege minimization, sealed M-16 preservation and fail-closed unavailable-provider behavior.

## Exact authorization request

Owner selection required: **“Approve BLK-002-I1 local authoring only, using closed allowlist/manual admission for v1.”**

That phrase both selects the recommended deny-by-default admission policy and authorizes only the five-file categories and local static/injected tests above. It does not authorize dependency installation, Auth/provider calls, databases, SQL/migrations, Docker, services, ports, browser storage, Git operations, deployment, rollout or StoreFlow access.
