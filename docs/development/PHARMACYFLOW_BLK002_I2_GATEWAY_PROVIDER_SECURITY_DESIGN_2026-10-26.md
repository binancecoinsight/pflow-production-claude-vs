# BLK-002-I2 gateway/provider security design and feasibility

Date: 2026-10-26  
Baseline: `main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`  
Historical review checkpoint: `PF-SUP-2026-10-25-18`  
Milestone status: **CONDITIONAL**  
Runtime status: **BLOCKED — NO GATEWAY, PROVIDER, PRIVILEGED GRANT, ADMISSION ENDPOINT OR EXTERNAL ACCEPTANCE**

This is a local design and executable-specification artifact. It does not authorize or implement a production adapter, privileged endpoint, role/grant, migration, onboarding activation or external call. Migrations `000028` and `000029` were inspected and remain unchanged and unexecuted.

## PF-SUP-2026-10-26-01 specification correction

Independent review reproduced four defects in the first I2 model: effects preceded audit append, recovery did not reauthorize, operation fingerprints trusted an incomplete caller hash, and returned replay evidence was not deeply immutable. The corrected model now:

- stages state effects, the durable operation result and prepared audit evidence in a draft and commits them by one state-root swap only after audit preparation succeeds;
- derives stable actor identity and current action/mode-specific authority from an injected trusted boundary for both execution and recovery;
- computes SHA-256 fingerprints from an explicit typed-command projection, including action, stable actor, applicant/context, target/predecessor/replacement/provider IDs, reasons/evidence and canonical effect inputs while ignoring untyped claimed hashes;
- excludes credential version from operation identity so an authorized rotated credential for the same stable actor can recover, while revoked/stale credentials cannot;
- stores and returns deep-frozen copies of canonical results.

This corrects a local specification model only. It neither changes nor proves the database/Auth/provider implementation.

### Owner-authorization provenance

The original owner-supplied directive titled `PHARMACYFLOW — BLK-002-I2 GATEWAY/PROVIDER SECURITY DESIGN AND FEASIBILITY`, received in the current 2026-10-26 work session, expressly states that the product owner approved `BLK-002-I2 Option A`, `ADM-01 Option A` and `REV-01 Option A`, with local design/feasibility/injected tests only. The original message/attachment is not a tracked repository artifact; this repository record is secondary evidence and the independent reviewer must verify it against the original work transcript. No broader implementation or execution approval is inferred.

## 1. Feasibility conclusion

PharmacyFlow can use the existing reservation/issuer/onboarding shape safely only if the selected Auth provider and execution platform prove all of the following:

1. a dedicated, revocable workload identity can authenticate the gateway without a broad `service_role` secret;
2. provider identity creation accepts a PharmacyFlow operation identifier before the first side effect;
3. an ambiguous create can be resolved by that exact, non-client-writable operation identifier;
4. authenticated recovery proves the same subject, confirmed email and exact operation marker;
5. database privileges can be limited to a narrow façade and cannot invoke operator admission/revocation;
6. admission, reservation, eligibility revocation and consumption can serialize on authoritative rows with the lock rules below.

The repository proves the desired injected interfaces and static SQL intent, not those platform capabilities. Exact-operation provider recovery has not been demonstrated against a real provider. Therefore the design is conditionally feasible, but implementation and rollout stay blocked until provider/platform evidence exists. An ambiguous provider timeout must remain `RECOVERY_PENDING`; it is never interpreted as success or absence.

## 2. Evidence classification

| Classification | Evidence or conclusion |
|---|---|
| Confirmed in source | `owner-eligibility-issuer/index.ts` is dependency-injected and contains no server entrypoint, environment adapter or production provider. |
| Confirmed in source | `000028` creates private admission/eligibility ledgers, makes request bindings immutable, models monotonic eligibility, and revokes private function access from public, `anon`, `authenticated` and `service_role`. |
| Confirmed in source | `000029` resolves exact reservation replay before checking current admission, adds authenticated exact-operation recovery, and preserves a consumed canonical result. |
| Confirmed in source | The OWNER onboarding RPC authenticates `auth.uid()`, binds subject/request/fingerprint, locks the eligibility row, creates tenant effects and records `CONSUMED` in its transaction. |
| Local executable evidence | The I2 injected model covers operator/gateway separation, tenant binding, replay/conflict, lost responses, revocations and serialized race outcomes. |
| Design assumption | A dedicated workload principal can be mapped to only a future gateway façade and rotated without affecting operator identities. |
| Design assumption | Admission and eligibility decision logs can be append-only and retained independently of mutable current-state projections. |
| Provider validation required | Non-client-writable operation metadata, exact-operation lookup, create idempotency/ambiguity semantics, confirmation evidence and workload authentication. |
| PostgreSQL validation required | Effective privileges, RLS, transaction locks, race ordering, trigger behavior and canonical-response equality. |

No applicable provider documentation is stored in this repository. Provider compatibility is therefore unverified rather than inferred from SDK names or current Supabase usage.

## 3. Existing contract map

| Transition | Bound identities/context | Current source of authority | I2 disposition |
|---|---|---|---|
| Applicant identity | normalized email before Auth; immutable Auth subject after correlation | Auth provider plus private eligibility ledger and trusted app metadata | Provider proof remains required; email alone is never authority. |
| Pharmacy/tenant context | intended normalized pharmacy name/currency before creation; `pharmacy_id` after consumption | intent fingerprint, eligibility row, authenticated OWNER RPC | Introduce a stable prospective `pharmacy_context_id` in the forward contract; never accept a client-selected existing tenant. |
| Manual admission | email digest, `closed-manual-v1`, evidence ID, active flag | `owner_eligibility_admissions` | ADM-01 requires an audited platform-operator decision layer not presently represented. |
| Eligibility reservation | request ID, email digest, intent fingerprint, admission evidence, provider operation ID | private reserve function owned by issuer role | Gateway may request through a narrow façade only; it must not own the table or role. |
| Eligibility issuance | reservation state plus exact provider operation and trusted marker | injected issuer repository/Auth adapter | Production provider adapter absent. |
| Eligibility consumption | authenticated subject, exact request/fingerprint/marker and `ACTIVE` row | OWNER onboarding RPC and database transaction | Gateway must never consume; applicant invokes the authenticated RPC. |
| Eligibility recovery | authenticated subject plus exact provider operation | `000029` recovery function and injected provider contract | Exact-operation provider support remains unverified. |
| Admission revocation | active admission becomes inactive | policy approved by REV-01; no audited privileged operation exists | Separate future operator endpoint and decision event required. |
| Eligibility revocation | non-consumed eligibility becomes `REVOKED` | private function exists in `000028`, with no caller grant | Separate future operator endpoint and audit event required. |
| Audit evidence | request rows/canonical response provide partial technical evidence | private ledgers | Actor, permission, reason, payload hash, decision ID and credential version are missing; additive audit contract required. |

## 4. Recommended trust architecture

```text
Applicant session ──authenticated recovery/consume──> public authenticated façade
       │                                                    │
       │ descriptive onboarding request                    │ auth.uid() = applicant
       v                                                    v
Gateway façade ──dedicated workload assertion──> issuer command façade ──> private ledger
       │                     (narrow capabilities)                    │
       └── exact provider operation ──> Auth provider                └── OWNER RPC transaction

Platform operator ──strong operator authentication──> separate admission/revocation façade
                                                        └── append-only decision audit
```

The gateway executes in a PharmacyFlow-controlled server/Edge runtime. The runtime authenticates as a dedicated service principal using short-lived asymmetric workload assertions or mTLS-backed identity, subject to actual platform support. The database maps that identity only to a new gateway façade role. The façade owns no tables and can invoke only reserve, correlate and narrowly scoped recovery commands. It cannot approve, replace or revoke admissions; revoke eligibility; consume eligibility; create memberships directly; assign roles; select arbitrary Auth users; or bypass RLS.

The applicant remains a distinct authenticated Auth subject. Caller principal, applicant subject and prospective pharmacy context are separate mandatory fields. The gateway may relay applicant data but cannot assert an authenticated applicant. Confirmed continuation and consumption require an applicant token whose `auth.uid()` matches the immutable subject.

Platform operators use a different identity plane, permission set and endpoint. No gateway credential can be exchanged for operator authority. No existing `platform_admin` label is accepted without independent mapping to the exact permission and an access-method review.

### Confused-deputy controls

- Every command binds operation ID, caller principal, applicant subject/email digest, prospective pharmacy context, payload version/hash and result ID.
- The server derives caller identity from verified credentials, never request JSON.
- The applicant identity is derived from an authenticated subject for recovery/consumption; otherwise it is an unprivileged prospective identity until correlated.
- Existing tenant identifiers are rejected by the new-owner gateway. Tenant creation remains inside the OWNER RPC.
- Authorization occurs before provider calls. Provider results cannot expand database authority.
- Credential version and audience are checked per request; rotation invalidates the prior version.

## 5. Access-mechanism capability matrix

| Candidate | Authentication | Least privilege / custody | Rotation, replay and audit | Tenant isolation / compatibility | Disposition |
|---|---|---|---|---|---|
| Short-lived asymmetric workload identity | Signed, audience-bound workload assertion exchanged or verified by the façade | Strong if mapped to one NOLOGIN/NOBYPASSRLS façade role; private key kept in managed workload custody | Short lifetime, key ID/version, nonce/JTI and issuer/audience checks; strong attribution | Context is command-bound; platform/provider support unverified | **Recommended**, contingent on proof. |
| mTLS workload identity | Client certificate at controlled gateway ingress | Strong when certificate maps only to gateway façade | Certificate rotation/revocation and channel binding; operation ledger still required | Good isolation; hosting/database compatibility unverified | Acceptable alternative if end-to-end support is demonstrated. |
| Delegated applicant token | Applicant JWT is forwarded for subject-scoped recovery/consume | Appropriate only for applicant operations; cannot perform pre-auth identity creation or operator decisions | Token lifetime/rotation provider-managed; exact operation still required | Strong applicant binding, insufficient for gateway issuance | Required companion path, not the gateway principal. |
| Static narrow gateway secret | Long random secret mapped to façade | Possible but custody/blast radius weaker | Manual rotation; replay requires additional request signing/nonce | Provider support likely broad but not evidenced | Fallback only after security review. |
| Supabase `service_role` key | Bearer key with broad bypass semantics | Fails the required least-privilege boundary | Rotation is disruptive; weak per-operation attribution | Excessive cross-tenant authority | **Rejected**. |
| Database login owned by issuer role | Direct connection/password | Couples gateway to table/function owner and expands compromise impact | Long-lived credential and connection audit burden | Risks bypassing intended façade | **Rejected**. |
| Existing platform-admin or pharmacy-user identity | Human/session token | Conflates operator, gateway or tenant authority | Human session replay/impersonation risk | Breaks separation of duties | **Rejected**. |

## 6. Deterministic operation and recovery contract

| Operation | Stable identity | Required binding | Authoritative result |
|---|---|---|---|
| Applicant onboarding attempt | client-generated `onboarding_attempt_id` | normalized intent version/hash and prospective context | accepted/denied request envelope only; no rights |
| Manual admission decision | server-generated `admission_decision_id` | operator, permission, applicant digest, context, reason/policy | append-only decision event and current projection |
| Eligibility reservation | client request ID plus server provider-operation ID | gateway principal/version, admission decision, applicant, context, intent hash | immutable reservation/canonical issuer response |
| Eligibility issuance | provider-operation ID | reservation, exact provider subject/marker and response digest | issued subject correlation or `RECOVERY_PENDING` |
| Eligibility consumption | authenticated onboarding request ID | applicant subject, eligibility ID, context, intent hash | immutable pharmacy/membership/subscription response |
| Eligibility recovery | original operation ID (never a newly invented retry ID) | actor/subject, original payload hash/version and expected result identity | original stored result or explicit unknown/conflict |
| Revocation | server-generated revocation operation ID | operator, exact permission, target type/ID, applicant, context, reason | append-only revocation event and resulting projection |

All commands first insert or resolve an operation ledger row keyed by `(contract_version, operation_id)`. The immutable fingerprint is computed by the trusted boundary from the explicit typed command: action, stable actor ID, applicant identity, pharmacy context, target IDs, predecessor/replacement IDs, provider-operation ID, decision evidence/reason and every effect-bearing input. A caller-provided `payloadHash` is neither accepted nor authoritative. Credential version is audit evidence but is excluded from operation identity. Identical replay is returned only after current action-specific authorization; changed typed input returns `OPERATION_CONFLICT`. A new operation ID cannot bypass uniqueness of the underlying admission, open eligibility, provider operation or consumed entitlement.

In the corrected model, the effect, durable operation result and required audit event are prepared against one draft state. Audit preparation failure discards the draft, leaving no effect or replay result. A successful preparation is followed only by a single in-memory state-root replacement. This is executable-specification evidence, not a claim that current PostgreSQL tables already provide an atomic audit transaction.

### Failure cases

| Case | Required result |
|---|---|
| Successful commit, response lost | Exact-operation lookup returns the stored canonical result without repeating effects. |
| Repeated identical request | `REPLAY`; no provider call, state transition or duplicate audit effect. |
| Same operation ID, changed payload | `OPERATION_CONFLICT`; no effects. |
| New operation targets consumed entitlement | Reject as consumed; return the old result only through authorized exact replay. |
| Concurrent reservations | Serialize on applicant/context/open-entitlement key; one reservation or exact replay, all others typed conflict. |
| Provider effect, database result ambiguous | Persist/retain `RECOVERY_PENDING`; query provider only by exact operation; never create again until authoritative resolution. |
| Consumption timeout | Recover the original onboarding operation; never infer absence and never issue a replacement entitlement. |
| Admission revocation races reservation | Both lock admission before the open-entitlement key. Revocation-first denies; reservation-first commits a separately governed eligibility. |
| Eligibility revocation races consumption | Both lock eligibility. Revocation-first denies consumption; consumption-first makes immutable `CONSUMED` and revocation fails without rewrite. |
| Client/gateway restart | Reload original operation binding and durable state; credentials may rotate, operation identity must not. |

PharmacyFlow guarantees ledger uniqueness, lock order, immutable fingerprints/results, authorization and audit. The provider must guarantee non-client-writable operation correlation, exact-operation lookup and authoritative subject/confirmation evidence. If it cannot, the production architecture is blocked.

### Existing and proposed lock hierarchy

Existing migration behavior, based only on static inspection:

1. `000029 private_reserve_owner_eligibility_v1` takes advisory transaction locks for request ID and then normalized-email digest; resolves an exact request row `FOR UPDATE`; for a new reservation reads the active admission `FOR SHARE`; locks a conflicting open eligibility by email `FOR UPDATE`; and, for replacement, locks the predecessor eligibility `FOR UPDATE` before insert/update.
2. `000028 private_revoke_owner_eligibility_v1` locks only the target eligibility row `FOR UPDATE` before changing it to `REVOKED`.
3. The corrected OWNER RPC in `000028` locks the target eligibility row `FOR UPDATE`, then the subject/request onboarding row `FOR UPDATE`, before tenant effects and the `CONSUMED` update in the same function transaction.
4. Neither `000028` nor `000029` implements audited admission revocation, a security-operation ledger or the I2 operator/gateway façade. Therefore no existing database path proves atomic ADM-01 decisions or the admission-revocation/reservation race.

Proposed I3 order, not implemented: operation identity → applicant/email/context serialization key → admission row (shared for reservation, exclusive for operator change) → eligibility rows in deterministic request-ID order → onboarding request → tenant effects plus immutable result/audit in the same transaction. Paths that do not touch an earlier resource may begin at their first applicable lock but may never acquire a preceding class afterward. This proposal must be reconciled with `000029` replacement ordering before SQL is authored. The I2 race tests execute two sequential orders; they are not PostgreSQL concurrency, lock-overlap or deadlock evidence.

## 7. ADM-01 operator authority

| Role | Approve | Replace | Revoke admission | Revoke eligibility | Read audit | Gateway/provider calls |
|---|---:|---:|---:|---:|---:|---:|
| Admission reviewer | yes | no | no | no | scoped | no |
| Senior admission operator | yes | yes | yes | no | scoped | no |
| Security revocation operator | no | no | yes | yes | scoped | no |
| Independent auditor | no | no | no | no | read-only | no |
| Gateway principal | no | no | no | no | own operation status only | narrow issuer calls |
| Pharmacy owner/staff | no | no | no | no | own applicant status only | no |

The exact role names are proposed, not implemented. Each permission must be independently granted at the platform boundary; role strings supplied by a client are ignored.

Approval records applicant digest, prospective context, evidence references, policy version, reason code, operator subject, authentication assurance, permission, operation ID, payload hash and timestamp. Replacement is atomic: lock predecessor, verify same applicant/context, append a replacement decision, revoke the old admission projection and activate the new projection. It does not revoke or recreate eligibility. Admission revocation changes only future reservation authority. Eligibility revocation is a separate explicitly targeted decision.

Operator credentials use phishing-resistant MFA and short sessions. High-risk bulk decisions, operator self-targeting, break-glass use and repeated replacement/revocation should require a second operator or exceptional review. Revoking an operator disables new actions immediately but does not rewrite historical attribution.

Threat controls include no impersonation mode, no client-supplied operator ID/permission, independent session/audience checks, reason/evidence requirements, rate/anomaly monitoring, append-only audit export and separation between decision and gateway execution.

## 8. REV-01 state contract

| Current state | Operation | Result |
|---|---|---|
| Active admission | reserve | permitted if no conflicting open eligibility; reservation retains admission evidence |
| Revoked admission | reserve | denied |
| Active admission | revoke admission | admission becomes revoked; existing eligibility unchanged |
| Reserved/issued eligibility | revoke admission | eligibility remains reserved/issued |
| Reserved/issued eligibility | revoke eligibility | eligibility becomes revoked; further issue/consume/recovery-to-active denied |
| Consumed eligibility | revoke eligibility | rejected; consumed row and canonical result stay immutable |
| Consumed eligibility | exact consumption replay | original canonical result returned without effects |
| Recovery pending | revoke eligibility | revocation wins if it locks first; later provider evidence is recorded but cannot reactivate authority |
| Recovery pending | exact provider recovery then consume | only if eligibility remains unrevoked and all immutable bindings match |

The current database states can express separate admission and eligibility revocation, and `000029` correctly checks admission only for a first reservation. They cannot yet attribute ADM-01/REV-01 decisions, bind a stable prospective pharmacy context, or expose distinct least-privilege operator/gateway façades. Those gaps require a new forward-only protected change; `000028` and `000029` must not be edited.

## 9. Threat model

| Threat | Severity | Control / remaining evidence |
|---|---|---|
| Forged gateway identity | P0 | Dedicated audience-bound workload principal, per-request credential version, narrow façade; platform validation required. |
| Forged applicant identity | P0 | Authenticated subject for recovery/consume; immutable subject/operation marker; provider validation required. |
| Cross-tenant admission/reservation | P0 | Applicant/context binding at every layer and no arbitrary existing tenant input; PostgreSQL/RLS proof required. |
| Operator impersonation or privilege escalation | P0 | Separate permission plane, strong MFA, server-derived operator, no generic admin assumption; access design/review required. |
| Broad/static credential leakage | P0 | Reject `service_role`; short-lived managed workload identity, rapid version revocation and audit; hosting support unverified. |
| Double issuance or concurrent consumption | P0 | Unique open eligibility/provider operation plus row locks and immutable consumption; real concurrency unverified. |
| Immutable-history tampering | P0 | Append-only decisions/audit and terminal-row guards; schema and effective-owner proof required. |
| Replay / changed payload / operation collision | P1 | Contract-versioned operation key and full binding hash; cryptographically random IDs; collision/conflict monitoring. |
| Unauthorized revocation | P1 | Separate exact operator permissions, target binding and reason; endpoint not implemented. |
| Network timeout / partial commit | P1 | `RECOVERY_PENDING`, exact-operation recovery only; provider support unverified and therefore blocks rollout. |
| Provider outage | P1 | No duplicate create; durable pending state, bounded retry and operator-visible reconciliation queue. |
| Stale rotated credential | P1 | Credential version checked on every call; injected behavior proven, runtime mechanism unverified. |
| Audit privacy/leakage | P2 | Store email digest/reference rather than unnecessary plaintext; restrict and retain audit under approved policy. |
| Operation denial-of-service | P2 | Rate limits and bounded lookup; specific limits/retention remain owner/security decisions. |

There is no newly demonstrated source P0 in this local design. All P0 controls above remain release-blocking until protected implementation and real acceptance. Exact provider recovery is the principal unresolved P1 feasibility dependency.

## 10. Minimal forward-only protected change proposal

Proposed next scope name: **BLK-002-I3 — gateway/operator contract implementation (local authoring only)**.

Exact proposed source changes:

- new `supabase/functions/owner-eligibility-gateway/index.ts` façade with injected verifier, repository and Auth adapter;
- new `supabase/functions/platform-admission-operator/index.ts` with separately injected operator authorization;
- new focused tests beside both functions;
- new `supabase/contracts/owner_gateway_operator_v1.test.ts` static contract checks;
- one new forward-only migration `supabase/migrations/20261026000030_owner_gateway_operator_contract_v1.sql` (proposal only; do not execute);
- additive documentation/evidence updates only; preserve `000028` and `000029` byte-for-byte.

The proposed migration would:

1. add append-only `owner_admission_decisions`, `owner_eligibility_revocation_decisions` and `owner_security_operations` tables with actor/applicant/context/payload/result bindings;
2. add a stable prospective `pharmacy_context_id` and decision reference without rewriting existing immutable request bindings;
3. create NOLOGIN/NOBYPASSRLS façade roles distinct from table owners;
4. expose only narrowly typed SECURITY DEFINER commands owned by a non-login owner, with fixed `search_path`, explicit row locks and all default/public/anon/authenticated/service-role execution revoked;
5. grant the gateway façade reserve/correlate/status operations only, the operator façade exact admission/revocation operations only, and retain consumption solely on the authenticated OWNER RPC;
6. encode admission→reservation and eligibility revocation→consumption lock order and immutable audit triggers.

Implementation approval would authorize only local source/SQL authoring and injected/static tests. It would not authorize migration execution, credential creation, gateway deployment, provider calls, operator enrollment, grants on any environment, onboarding enablement or production activation.

### Acceptance matrix for later protected phases

| Gate | Required proof | I2 status |
|---|---|---|
| Local type/static/injected | authority, binding, replay, races and prohibited grants | I2 model passes; future implementation tests pending |
| Provider sandbox | exact-operation create/recovery, non-client metadata, confirmation, timeout semantics | NOT VERIFIED |
| PostgreSQL isolated target | effective privileges/RLS, lock overlap, race outcomes, immutable audit/result | NOT VERIFIED / AUTH-02 deferred |
| Auth acceptance | gateway workload principal and applicant subject separation | NOT VERIFIED |
| Browser | explicit recovery/consume UX and restart behavior | NOT VERIFIED |
| Independent security review | exact snapshot, privileges, provider evidence and threat closure | REQUIRED |

Containment/rollback is disable façade routing, revoke the dedicated workload credential and façade EXECUTE grants, and leave all admissions, eligibility, operations and audit evidence intact. Never delete or revert consumed evidence. Forward fixes supersede code/schema; historical migrations remain sealed.

## 11. Owner decisions and roadmap impact

- `BLK-002-I2`: **OWNER-APPROVED, LOCAL DESIGN AND FEASIBILITY — completed conditionally**.
- `ADM-01`: **OWNER-APPROVED POLICY — operator identity/access implementation pending independent review**.
- `REV-01`: **OWNER-APPROVED POLICY — protected implementation pending**.
- `AUTH-02`: **OWNER-DEFERRED**.
- `AUTH-03`: **READ-ONLY DEV SCOPE APPROVED; ACCESS METHOD NOT VERIFIED**.
- `AUTH-04`: **RELEASE PREPARATION ONLY**.
- `AUTH-05`: **DEPLOYMENT PLANNING ONLY**.

M4 remains blocked on I3 implementation authorization, provider proof and protected database/Auth/browser acceptance. M5 and PharmacyFlow MVP are not ready. Deployment readiness remains blocked.

Outstanding owner approvals are limited to the proposed I3 local implementation scope, the later exact provider-validation scope, and still-later environment-specific migration/acceptance/deployment operations. Provider selection, retention/rate limits and operator access method also require decisions before activation.

## 12. Local test evidence and limitations

Safe command inspected and executed:

`node --loader ./scripts/typescript-loader.mjs scripts/specification/blk002-i2-security-contract.test.ts`

Corrected result after PF-SUP-2026-10-26-01: **44 passed**. The test imports only the local pure specification, Node's local SHA-256 implementation and the repository's esbuild-backed loader. It has no database, network, Auth, Docker, browser-storage, environment credential or provider adapter.

Focused strict TypeScript compilation of the two I2 files also passed using `tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --types node --strict`.

Historical I1 evidence was treated as prior review evidence. Any additional focused reruns and their results belong in the canonical test-evidence register and I2 review package.

## 13. Independent review request

Request GPT-6 Work perform an incremental review of only the BLK-002-I2 files and narrow canonical-register insertions. Verify the contract map against `owner-eligibility-issuer/index.ts`, migrations `000027`–`000029`, the OWNER RPC and existing I1 tests; review the chosen workload-principal architecture, ADM-01/REV-01 semantics, threat severities, I3 protected scope and freshly reported local test results. Do not broaden this into a full-repository audit and do not infer authorization to execute external acceptance.

## 14. Safety attestation

No database query or migration, network/provider/Auth request, Docker/Supabase/service/port action, browser/IndexedDB integration, credential access, privileged grant, admission/onboarding activation, Git mutation, deployment, cleanup or destructive operation was performed. StoreFlow and all of its resources remained untouched and uninspected.
