# BLK-002 security and rollout correction

Checkpoint basis: **PF-SUP-2026-10-25-14**. Status: **LOCAL CORRECTION — INDEPENDENT REVIEW REQUIRED — NOT DEPLOYABLE**.

## Rollout decision

Owner registration is disabled by default. The client has no production trusted-owner identity provider and must make zero Auth-creation calls unless all of these are independently verified and explicitly enabled together: profile-only Auth trigger, `owner-onboarding-v1` RPC contract, trusted OWNER-eligibility issuance, and a trusted identity provider that binds the Auth subject to the original request. A later tenant RPC failure cannot roll back an earlier Auth insert, so public `auth.signUp` is not part of the corrected flow.

Normal sign-in/session refresh resolves existing memberships only. It never invokes owner onboarding. Recovery is a separate explicit action, is available only when the signed-in user has a syntactically valid `owner-onboarding-v1` request description, and reuses its original request ID. Client metadata describes that request but does not confer eligibility.

## OWNER eligibility policy

The RPC requires all of the following server-observed evidence:

- `auth.uid()` and confirmed email;
- `raw_app_meta_data.pharmacyflow_identity_class = OWNER_ONBOARDING_V1`;
- a server-written `pharmacyflow_owner_eligibility_v1` object whose contract version, request ID and subject ID exactly match the RPC and authenticated user, with non-empty authorization time;
- absence of the staff-bootstrap identity class/marker.

Staff-bootstrap identities receive a typed denial and cannot mint OWNER. Missing or malformed eligibility also receives a typed denial. Browser-writable `raw_user_meta_data` is never consulted for OWNER eligibility.

## Contract reconciliation

| Item | Corrected contract | Review note |
|---|---|---|
| Request scope | Composite `(user_id, request_id)` | The same random request UUID may exist for different authenticated subjects; replay/conflict is isolated per subject. |
| Fingerprint | SHA-256 over contract version, authenticated-user scope, user ID, normalized pharmacy name and currency | Version and scope are immutable inputs. |
| Exact replay | Returns the stored JSONB response with no new effects | Actual concurrent behavior remains unexecuted. |
| Conflict | SQLSTATE `PF005`, mapped to `REQUEST_CONFLICT` | Different fingerprint/version for the same scoped request fails before tenant effects. |
| Eligibility failures | `PF002` unverified, `PF003` staff identity, `PF004` missing/mismatched OWNER eligibility | Proposed SQL contract codes, not executed database evidence. |
| Atomic effects | Pharmacy, main branch, TRIAL subscription and active OWNER membership in one RPC transaction | Auth identity creation is outside this transaction and separately gated. |
| Canonical response | Contract version/scope, created IDs, server-selected OWNER/ACTIVE/TRIAL, currency, trial start/end and completion timestamp | Client rejects missing, malformed or mismatched evidence. |
| Trial evidence | One database UTC `v_now`, fixed 14-day end, returned and stored with response | Existing reviewed trial policy is not client-selectable. |

## Exact privilege matrix proposed by the migration

This matrix is a proposal for independent review, not privilege acceptance.

| Principal/object | Proposed privilege | Row boundary / rationale |
|---|---|---|
| `pharmacyflow_onboarding_owner` role | `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS` | Cannot authenticate, inherit, or globally bypass RLS. No role membership is granted. |
| schemas `public`, `auth` | `USAGE` | Resolves explicitly named objects only. |
| `auth.users` | `SELECT (id, email_confirmed_at, raw_app_meta_data)` | Reads verified identity/server eligibility; email and credential columns are excluded. |
| `public.user_profiles` | `SELECT (id, full_name, phone_number)`; `INSERT (id, full_name, phone_number)`; `UPDATE (full_name, phone_number, updated_at)` | Profile-only Auth trigger; no delete. |
| `public.pharmacies` | `SELECT (id, owner_id)`; `INSERT (id, name, owner_id, currency, subscription_plan, subscription_expires_at)` | Role-specific policies require `owner_id = auth.uid()`; no update/delete. |
| `public.branches` | `INSERT (id, pharmacy_id, name, is_main)` | Policy requires an Auth-owned pharmacy; no update/delete/select grant. |
| `public.subscriptions` | `INSERT (id, pharmacy_id, plan_code, status, current_period_start, current_period_end)` | Policy requires an Auth-owned pharmacy; no update/delete/select grant. |
| `public.pharmacy_members` | `INSERT (id, user_id, pharmacy_id, role, default_branch_id, status)` | Policy requires `user_id = auth.uid()`, constants `OWNER`/`ACTIVE`, and an Auth-owned pharmacy. |
| `public.owner_onboarding_requests` | Dedicated role owns table; client roles revoked; FORCE RLS | `FOR ALL` policy requires `user_id = auth.uid()` and exact contract version. Immutable trigger protects identity/version/fingerprint and completed rows. |
| `public.handle_new_user()` | Dedicated role owns SECURITY DEFINER function; PUBLIC/anon/authenticated execute revoked | Trigger writes profile fields only. |
| `public.rpc_create_pharmacy_owner_v1(UUID,TEXT,TEXT)` | Dedicated role owns SECURITY DEFINER function; only `authenticated` receives execute | Fixed `search_path`; eligibility precedes reservation/effects. |

### Privilege questions requiring independent review

1. Confirm Supabase/PostgreSQL permits the column grants, role-specific policies and Auth trigger execution exactly as proposed without implicit extra grants.
2. Confirm FORCE RLS evaluation for `pharmacies`, `branches` and the request table under the non-bypass function owner, including policy subqueries.
3. Confirm ownership of the private request table and two functions is the minimum acceptable ownership model; no global `BYPASSRLS` exception is requested.
4. Confirm the `auth.users.raw_app_meta_data` column grant and trusted eligibility issuer design before any provider implementation.
5. Confirm custom SQLSTATE values `PF001`–`PF006` propagate through PostgREST/Supabase as expected.

The migration aborts if the dedicated role already exists so it cannot silently reuse a principal with unknown historical grants or memberships.

## Staff bootstrap boundary

No production reservation/Auth provider exists. Injected providers must return exact contract version, request ID, invitation ID, recipient, tenant UUID, allowed non-OWNER role, request fingerprint, reservation ID and provider-operation ID before Auth work. Confirmed existing identities are not mutated; they sign in and use sealed M-16. Ambiguous creation recovery uses provider-operation ID, never email alone. For new/unconfirmed correlated identities, the idempotent trusted marker is written after correlation and before idempotent reservation completion. If completion fails, retry must recover the same operation/identity and identical marker; conflicting marker data fails closed.

## Evidence boundary and next gate

Models are synchronous/in-memory or static checks. They do not establish PostgreSQL concurrency, rollback, grants/RLS, Auth behavior, PostgREST mapping, browser behavior or deployment readiness. AUTH-02 remains **NOT RUN — OWNER DEFERRED**. Stop for independent security/privilege review of the scoped hash manifest before dependent protected implementation.
