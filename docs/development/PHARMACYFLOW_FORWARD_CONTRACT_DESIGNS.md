# PharmacyFlow forward-only onboarding and entitlement contract designs

Status: **DESIGN FOR OWNER/INDEPENDENT REVIEW — NOT IMPLEMENTED OR EXECUTED**  
Policy basis: APP-01 and APP-02 remain approved and are not reopened.

## Onboarding contract v1

### Forward migration boundary

A reviewed additive/forward correction would replace the automatic M-2 OWNER bootstrap for future identities while preserving every existing pharmacy, membership and subscription. The auth-user trigger becomes profile-only unless trusted, service-authored `app_metadata` identifies an invitation bootstrap. Client-writable `user_metadata`, pharmacy IDs and role strings are never authorization evidence.

### OWNER operation

Proposed RPC: `rpc_create_pharmacy_owner_v1(p_request_id uuid, p_pharmacy_name text, p_currency text default 'NGN')`.

Preconditions: `auth.uid()` exists; `auth.users.email_confirmed_at` is non-null; normalized name is valid; caller is not using a staff-bootstrap identity; request ID is valid and unused or an exact replay. The RPC accepts no role, owner user ID, trial dates or subscription plan from the client.

One transaction locks an onboarding request row keyed by `(auth.uid(), p_request_id)`, creates pharmacy, main branch, 14-day trial with server UTC anchors, and one OWNER membership, then stores the canonical response. Exact replay returns the same IDs. Same request ID with different normalized input returns a typed idempotency conflict. Unique-policy conflicts return a typed conflict and never attach the caller to another tenant. Any failure rolls back every effect; no orphan pharmacy, branch, subscription or membership is permitted.

Locking a request row that does not yet exist is not a first-request mutex. The forward design must first reserve `(caller_user_id, request_id)` with a unique constraint using `INSERT ... ON CONFLICT`, then lock the winning row. The row contains a versioned request fingerprint over canonical pharmacy name, currency and contract version; it never contains a caller-selected role. A concurrent exact fingerprint waits for the winner and returns its stored canonical response. A different fingerprint receives typed `ONBOARDING_IDEMPOTENCY_CONFLICT`. An abandoned `IN_PROGRESS` reservation is recoverable only after the database proves no tenant effects exist for it; otherwise it returns `ONBOARDING_RECOVERY_REQUIRED`.

The canonical response records request ID, pharmacy ID, main branch ID, OWNER membership ID, subscription ID, trial timestamps, normalized inputs, contract version and completion timestamp. IDs are generated once and remain stable across replay. Response persistence commits with tenant effects or everything rolls back.

### Ownership, grants and RLS boundary

The proposed onboarding RPC is `SECURITY DEFINER`, owned by a dedicated non-login migration owner, uses a fixed trusted `search_path`, schema-qualifies every object, revokes execution from `PUBLIC`/`anon`, and grants only to `authenticated`. It derives the user exclusively from `auth.uid()` and rechecks confirmed email server-side. Direct pharmacy, subscription and OWNER-membership inserts remain denied to ordinary clients by grants and RLS. The reservation table permits no direct client access, and return rows expose only the caller's canonical result.

The profile bootstrap trigger has the same reviewed ownership/search-path discipline and minimum insert surface. Its default behavior is profile-only. It recognizes invited-staff bootstrap only from trusted, non-client-writable `app_metadata`; client `user_metadata`, roles and tenant IDs are ignored.

### Invited-staff bootstrap

A trusted server endpoint first validates invitation ID/token, recipient email, PENDING state, expiry, revocation, transfer resistance and non-OWNER role without consuming the invitation. It creates the auth identity through the trusted admin API with non-client-writable `app_metadata.registration_kind=STAFF_INVITE` and the invitation ID. The profile-only trigger recognizes only that trusted marker and never creates a pharmacy/OWNER membership. After email confirmation and sign-in, the existing sealed M-16 acceptance RPC performs the locked membership creation and consumes the token.

Existing confirmed users skip identity creation and invoke M-16 directly. Acceptance must validate returned `member_id`, `pharmacy_id`, approved staff role and `ACTIVE` status. Existing tenant selection remains stored only as a preference and is revalidated against all active memberships after acceptance.

Auth identity creation and database invitation state cannot share one PostgreSQL transaction. The trusted bootstrap reserves a unique invitation-bootstrap request before calling the auth provider and stores the resulting auth user ID. If auth creation fails, the invitation remains unconsumed and the reservation records a sanitized retryable failure. If auth succeeds but database continuation fails, retry locates that exact identity; it must not create a second identity or consume the invitation blindly. Email mismatch, conflicting identity or uncertain provider outcome returns `STAFF_BOOTSTRAP_RECOVERY_REQUIRED` without granting membership. M-16 remains the only membership-consumption step after verified sign-in.

Aborts: unconfirmed owner, client-writable marker, OWNER invitation, email mismatch, expired/revoked/accepted token, request hash mismatch, partial effect or inability to prove trusted app metadata.

## Entitlement contract v1

### Trusted anchors and state

Persist immutable/server-maintained `trial_started_at`, `trial_ends_at`, `paid_entitlement_ends_at`, `grace_started_at`, `grace_ends_at`, `prior_plan_code`, transition reason and source event ID. All comparisons use database UTC. Login, reinstall, tenant switch and client time never rewrite anchors. Payment integration/pricing remains outside this design.

Existing stored values map conservatively: valid `TRIAL` and `ACTIVE` use their recorded period; `PAST_DUE` maps to `GRACE` only with an eligible preceding entitlement and immutable grace anchor; `CANCELLED` and `EXPIRED` deny new mutations; `SUSPENDED` is used only under an approved policy; missing, malformed or contradictory evidence maps to `UNKNOWN`. Grace inherits only the immediately prior authorized plan and ends exactly at `grace_ends_at`, seven calendar days after the eligible entitlement end. Login and payment retries never move it.

An authoritative entitlement function returns state, current/prior plan, capability set, effective timestamps and evidence version. `GRACE` inherits the immediately preceding eligible plan for exactly seven calendar days. `SUSPENDED` remains available only through an independently approved policy.

### Offline eligibility

The authoritative eligibility instant is the first trusted server acceptance of an immutable signed operation—not its unsigned client timestamp. After expiry, the server may finish, query or exactly replay an operation whose `(pharmacy_id, client_op_id, payload_hash, operation_type)` was journaled as accepted before the entitlement deadline. A never-seen operation is rejected after expiry even if it carries an earlier client timestamp. Response-loss reconciliation and exact replay do not create a second financial or stock effect.

Consequently, a legitimate sale frozen locally before expiry but first synchronized after expiry remains locally durable and recoverable but is **not** financially completed automatically. It receives typed `ENTITLEMENT_ACCEPTANCE_REQUIRED`, remains quarantined with stable IDs, frozen payload and signature, and is never deleted or rewritten. Local durability proves what the client preserved; it does not prove when a trusted server accepted it.

The smallest trustworthy alternative is a short-lived server-signed offline eligibility grant issued while entitled and bound to pharmacy, device, membership/role, branch, plan capabilities, issuance/expiry, evidence version and a server-controlled operation budget or monotonic sequence range. The signed operation binds the grant ID and consumes its unique sequence server-side. This permits first synchronization after expiry only when the server verifies that the grant covered that operation class and was unused when the immutable payload was frozen. It introduces issuance, revocation, theft, clock-skew, budget and device-compromise policy. **Remaining owner decision:** retain conservative first-server-acceptance for MVP, or separately approve bounded signed offline grants. Until then, post-expiry first-seen sales require reviewed renewal/support resolution and cannot be auto-completed.

### Operation matrix

| Operation | TRIAL/ACTIVE | GRACE | EXPIRED | Required authoritative check |
|---|---|---|---|---|
| New sale/freeze/commit | plan permission | prior-plan permission | deny | first server acceptance; exact accepted replay remains queryable |
| Product create/edit/status | plan permission | prior-plan permission | deny | mutation RPC transaction |
| Intake/adjustment/transfer dispatch | plan permission | prior-plan permission | deny | mutation RPC transaction |
| Transfer receive | plan permission | prior-plan permission | deny unless server proves the transfer was accepted before expiry and completion is explicitly classified as reconciliation | locked receive RPC |
| New refund/return/restock | role + plan | role + prior plan | deny | Refund V2 gateway/RPC pre-effect check; exact pre-expiry accepted replay only |
| Open cash shift | plan permission | prior-plan permission | deny | open-session RPC |
| Close/reconcile existing shift | plan permission | prior-plan permission | allow only as reconciliation of a server-known open shift | close-session RPC |
| Customer/supplier/staff mutation | plan permission | prior-plan permission | deny | respective mutation/invitation RPC |
| Historical reads/reports/export | authorized role | authorized role | allow read-only | RLS/RPC role/tenant/branch policy |
| Durable checkout review/receipt/acknowledgment | allow | allow | allow; acknowledgment must not reserve a replacement | local evidence plus status RPC where needed |
| Status/recovery/exact replay | allow | allow | allow only for previously accepted identity/hash | journal/status RPC |
| Renewal/support | allow | allow | allow | dedicated non-operational contract |

### Enforcement locations

Checks belong inside each authoritative RPC transaction and Edge gateway immediately before the first durable acceptance/effect. Client capability flags are UX containment only. M-18, Refund V2, inventory mutation RPCs, staff invitation/role RPCs, cash reconciliation and future customer/supplier writes each need explicit coverage. Status-v2 must remain visibility-conservative and must not translate denied evidence into authorized absence.

Each denial is typed and effect-free: `ENTITLEMENT_EXPIRED`, `ENTITLEMENT_UNKNOWN`, `PLAN_CAPABILITY_DENIED`, `ENTITLEMENT_ACCEPTANCE_REQUIRED`, or `ENTITLEMENT_EVIDENCE_CONFLICT`. An exact accepted replay is distinguished from a new operation before entitlement denial. Gateways preserve sanitized codes without fabricating success. Rollback leaves nonce, journal, financial, inventory and audit effects absent unless a separately reviewed contract explicitly records a non-financial denial audit.

M-18, Refund V2 signatures and response contracts, sealed migrations, stable operation/checkout/sale IDs, frozen bytes, conservative `UNKNOWN` handling and legacy quarantine remain unchanged. All server changes described here require additive forward migrations and independent security/financial review.

### Approval gate

Implementation requires separate approval for a reviewed forward migration, RPC/trigger changes, Edge changes and isolated PostgreSQL verification. Sealed migrations and Refund V2 contracts are not edited by this design.
