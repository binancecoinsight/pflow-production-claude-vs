# PharmacyFlow Decision Ledger

## DEC-045 - PF-MVP-10 native-client diagnostic boundary

1. A native diagnostic prefix authorizes no content. It is normalized only when its source resolves to the exact approved `-f` SQL path and its line is positive and within that file.
2. Normalization removes the file/line prefix before notice or worker-event validation. Raw paths and diagnostic payloads are never retained.
3. Benign migration notices use exact PostgreSQL forms, including `column … of relation …` and `constraint … of relation …`; unknown `NOTICE` and all context diagnostics remain fail-closed.
4. Native transcript rehearsals are source/consumer conformance evidence only. PostgreSQL execution remains a separate protected acceptance gate.

## DEC-044 - PF-MVP-10 emitter/consumer conformance

1. Runtime proof has one frame contract: `PF_PASS|runtime|<server-version-number>|target-verified`.
2. Every non-worker acceptance SQL module emits exactly one expected terminal frame. Protected migrations emit no protocol frames; narrowly enumerated PostgreSQL skip notices are validated and discarded.
3. Worker evidence is exactly two validated events for the expected actor: READY then TERMINAL. Other `PF_PASS`, `PF_RESULT`, `PF_COUNT`, actor, duplicate, field or diagnostic evidence rejects the worker and is not retained.
4. Concurrency testing replaces sync/worker processes only; it runs the production coordinator. Source-derived representative transcripts establish conformance, never PostgreSQL behavior.

## DEC-043 - PF-MVP-10 whole-command acceptance closure

1. `PF-MVP-10_EXECUTION_INVENTORY.sha256` is the sole executable inventory: 41 active migrations plus 20 exact runtime dependencies. Review manifests are historical evidence and are never recursively executed or revalidated as current source inventories.
2. Managed command dispatch communicates only through structured results and exceptions. `$LASTEXITCODE` is not an input to command success.
3. Raw stdout, stderr and notices are never retained. Only narrow validated `PF_*` frames and fixed non-secret diagnostic dispositions may enter evidence.
4. Every documented command must pass the same authorization, inventory, dispatch and result path in the injected rehearsal. Protected process execution is the only replaced boundary.

## DEC-042 - PF-MVP-10 production-path integration closure

1. The runner has one default PowerShell-to-C# process bridge. Tests may replace its process adapter, but not the bridge or result validation.
2. Worker evidence is a complete versioned transcript: READY with backend identity, coordinator BLOCKER, and TERMINAL. M-13 concurrent duplicate identity is `23505` conflict, not replay.
3. Refund V2 exact replay retains operation/payload identity but consumes a fresh transport nonce. Nonce reuse, changed payload and expired committed replay are separate assertions.
4. Append-only audit, ledger and entitlement evidence is not removable by fixture cleanup. Cleanup proves ownership/dependencies and refuses deletion; environment destruction is a separate owner decision.

## DEC-041 - PF-MVP-10 runner safety closure

1. Acceptance assertions are mutating fixture work and require explicit `fixtureWrite` authority in both preflight implementations.
2. The owner marker is a database-comment identity proof, not an echoed client variable. Mutating commands also require empty-target or verified-000039 state.
3. Persistent fixtures require authorization/marker ownership plus exact UUID and dependency validation; cleanup and destruction remain distinct gates.
4. Only distinct backends with an observed production lock blocker and exact effects qualify as concurrency evidence.
5. PowerShell Core 7 and executable bytes are pinned; process arguments remain discrete and raw output is bounded before sanitized retention.

## DEC-040 - PF-MVP-10 acceptance harness boundaries

1. An owner instruction to author the harness is not authority to execute it. Execution authorization must pin target, operator tooling, evidence, hashes, commands and scenarios.
2. Supabase Auth schemas/roles/functions and `pgcrypto` are runtime prerequisites, not replaceable test conveniences.
3. Missing approval, hash/identity drift, incompatible runtime, cancellation or overbroad permissions abort before the next executor call.
4. Fixture cleanup is separately authorized and limited to fixed package-owned identities. Environment destruction is a distinct decision and has no generic implementation.
5. Provider/Auth UI, browser/datastore, AUTH-02 and direct-table policy remain excluded rather than synthetically accepted.

## DEC-038 - Operation-specific inventory response evidence - 2026-10-29

1. A table-returning mutation RPC must yield exactly one row; null, zero or multiple rows are invalid success evidence.
2. Timestamps require strict Gregorian RFC3339 with an explicit timezone and PostgreSQL-compatible fractional precision; ambiguous JavaScript date parsing is prohibited.
3. Intake validates completed status, item count and cost arithmetic. Adjustment validates requested batch, signed delta and resulting arithmetic. Receive validates requested transfer and positive item count.
4. Dispatch returns the current transfer status on replay. Therefore exact dispatch replay accepts `DISPATCHED` or lifecycle-advanced `RECEIVED`; it must not require the initial status after receipt.
5. Relationships are validated only when sealed SQL guarantees them. Server-generated intake purchase and dispatch transfer IDs require valid UUIDs but are not compared with unrelated request IDs.
6. Snapshot mapping preserves returned tenant identifiers into validation. Rejection precedes replacement and preserves complete cache evidence.
7. Entitlement `000035` is a separate protected-authoring concern and is not integrated by inventory work.

## DEC-037 - MVP-02 local inventory acceptance boundary - 2026-10-29

1. Accept MVP-02 locally only for inspected production source, injected client executors, in-memory presentation helpers and isolated fake IndexedDB.
2. Snapshot replacement requires unique identities, valid batch-to-product association and safe integer quantities/prices before any transaction starts.
3. Mutation success requires explicit response evidence; missing, malformed, unsafe or mismatched fields return `UNEXPECTED_RESPONSE` without defaults or coercion.
4. Mocked RPC success establishes client handling only, never authoritative stock effects. Failed refresh preserves prior valid cache; valid refresh atomically replaces it.
5. Inventory integration must not rewrite durable checkout identity, draft, sale, transaction or queue evidence.
6. RPC signatures/payloads, accounting, schemas and protected contracts remain unchanged. Database/RLS/ledger/concurrency and browser acceptance remain separate under deferred AUTH-02.

## DEC-036 - Cached branch stock evidence and local attention bands - 2026-10-28

1. InventoryView runs one branch-scoped cached-stock derivation and passes the exact result to the attention panel and ProductList. ProductList performs no independent raw batch aggregation.
2. Evidence identity is the coherent user, membership version, pharmacy, branch and role workspace key. Loading, query transitions, errors and workspace changes suppress prior numeric evidence.
3. A missing batch group is unknown; an explicitly loaded empty group is known zero. Duplicate identities, malformed collections/rows, cross-pharmacy/product associations and unsafe individual or aggregate integers fail closed.
4. Valid negative projections remain deficits. The display bands are `<=0`, `1-10`, and `>10`; the middle band is only a local cached attention band, never `reorder_level`, available-to-sell stock or purchasing advice.
5. No expiry/status filtering is introduced. Search, limits, stale metadata, incompatible counts and snapshot generations prevent branch-wide completeness claims.
6. The snapshot/query/storage/server contracts remain unchanged. Browser, IndexedDB, RLS/database and authoritative-stock acceptance remain separate under deferred AUTH-02.

## DEC-035 - Product-detail publication identity - 2026-10-28

1. Product-detail async state is identified by request generation and the complete coherent workspace key, pharmacy and selected product. Matching A identity after A-to-B-to-A is insufficient without the newest generation.
2. Loading start, successful batches, unavailable evidence and loading finalization each pass through the same synchronous current-binding publication boundary. No caller carries a prior freshness decision across an await.
3. Replacement selection starts a new generation. Modal close and coherent user/membership-version/pharmacy/branch/role changes invalidate and clear the visible detail state; unmount permanently disposes the coordinator.
4. Successful evidence requires every returned batch to match both the requested pharmacy and product. Malformed associations fail closed to unavailable for a current request; stale failures and successes publish nothing.
5. The existing eligible-batch query, strict expiry policy, presentation, POS/FEFO, durable checkout and financial/synchronization contracts remain unchanged. Local synthetic evidence is not browser/datastore/database acceptance; AUTH-02 remains deferred.

## DEC-034 - Shared inventory expiry and reference-date contract - 2026-10-28

1. Batch expiry accepts exact, valid Gregorian `YYYY-MM-DD` only; no trimming, prefix/suffix acceptance or calendar normalization is permitted.
2. Reference dates accept valid `Date`, finite in-range epoch milliseconds, exact date-only, or strict timezone-bearing ISO/RFC3339 timestamps. Ambiguous JavaScript string parsing is prohibited.
3. Date-only values are UTC days; timestamps are reduced from their actual instant to the UTC calendar day. Epoch zero is valid and selection uses nullish rather than truthy fallback.
4. Same-day remains expired and valid FEFO ordering is preserved.
5. One malformed candidate invalidates the complete selection/finalization operation. It is never silently skipped in favor of another candidate.
6. Invalid expiry blocks cart mutation and sale/queue persistence but preserves the original durable checkout reservation and identities. Inventory detail reports unavailable evidence rather than empty inventory or FEFO confidence.
7. Existing historical records are not repaired or migrated. Protected/browser/database acceptance remains separate and AUTH-02 remains deferred.

## DEC-033 - MVP-01C read-only invitation publication boundary - 2026-10-27

1. The only runtime invocation authored is M-16 `rpc_list_staff_invitations(UUID)` with `p_pharmacy_id` derived from the current coherent workspace; no fallback query exists.
2. Client eligibility requires one coherent active OWNER/MANAGER user, membership, pharmacy, role and branch binding. This is UX containment and never substitutes for server authorization.
3. All ten returned fields are validated as a complete response before publication. Raw RPC rows and diagnostics never enter React state; published rows and the containing array are allowlisted and frozen.
4. Server status remains authoritative. A PENDING record past `expires_at` may carry only a visibly labelled time-derived indicator.
5. Request generation and complete workspace binding are checked at the synchronous publication callback. Refresh and lifecycle invalidation prevent late or cross-workspace publication.
6. Staff mutation, roster, storage, migration and protected execution scope is unchanged. Independent source review is next; AUTH-02 remains deferred.

## DEC-026 — Review reconciliation and I3A authority design — 2026-10-26

1. Treat PF-SUP-02/05/06 as owner-supplied transcript evidence with only the stated dispositions; the repository-native review export remains missing.
2. Preserve the earlier conditional-gate assessment as correct historical evidence for what was locally available then; supersede its prospective gate conclusion using the later supplied review disposition without rewriting it.
3. Separate technical acceptance, owner permission and protected execution. None substitutes for another; AUTH-02 remains deferred.
4. Recommend two-person authority governance and single-active-version rotation. JWT claims are compared with an authoritative registry and never grant authority alone.
5. Recovery, operator and applicant identities remain separate. service_role, generic admin and pharmacy-user identities are not workload authority.
6. Prepare exact disposable matrices/commands only; no harness, target, identity, credential, fixture, service or browser profile is created or used.
7. Stop after the hashed I3A design package for independent review.

## DEC-025 — I3 global operation boundary and recovery parity — 2026-10-26

1. Pending issuance and completed operations share one immutable operation-ID namespace bound to action, stable principal, applicant, context and command fingerprint.
2. Completed operation identity is checked before a new issuance attempt; every completed operation insert must reconcile the global claim. Collision failure rolls back the surrounding SQL transaction.
3. Recovery-only authority may query and finalize one exact durable pending attempt, but may not initiate issuance, inspect arbitrary email identity or create a provider identity.
4. Active RPC signatures explicitly revoke all default/unintended execution and grant one executor only. Superseded identity v2 RPCs remain withdrawn.
5. Focused I3 and root application compilation are separate evidence. Static/sequential success is not PostgreSQL syntax, ACL, RLS or concurrency acceptance.
6. Preserve 000027–000031 and correct through unexecuted 000032. Stop for independent review; AUTH-02 and I3A remain unauthorized/deferred.

## DEC-024 — BLK-002-I3 bounded source correction — 2026-10-26

1. Persist and validate a unique issuance attempt before the first provider effect. Pending/uncertain recovery never implies permission to create again.
2. Use one ordered UTF-8 byte-framed fingerprint contract in TypeScript and SQL; executor hashes are comparison inputs, never authority.
3. Keep normalized-email digest as applicant identity for every lifecycle state and store Auth subject separately.
4. Claims are necessary but insufficient: every operation and recovery also requires an active authoritative row, exact current version and action permission. Registry provisioning is outside this batch, so the contract fails closed.
5. Preserve 000027–000030 and correct through unexecuted 000031. Sequential/static checks are not PostgreSQL concurrency, rollback, RLS or grant proof.
6. Stop for independent review. No provider integration, identity provisioning, AUTH-02 execution, signup, activation or deployment is authorized.

## DEC-023 — BLK-002-I3 inactive façade and forward contract — 2026-10-26

1. The owner explicitly authorized the bounded I3 local-authoring scope after referencing PF-SUP-2026-10-26-02. The detailed review artifact is not present locally and is not reconstructed.
2. Gateway and platform-operator façades remain inactive and dependency-injected: no server route, environment adapter, backend client, provider, credential or activation.
3. Proposed executor roles are separate `NOLOGIN NOINHERIT NOBYPASSRLS` roles with no membership or direct table grants. Gateway and operator RPC grants are mutually exclusive; `service_role` receives none.
4. Migration `000030` is forward-only and unexecuted. It fails closed if pre-I3 rows require context/provenance reconciliation; it does not rewrite migrations `000027`–`000029`.
5. Operation replay follows current authority, stable principal identity, typed-command fingerprint and immutable canonical results. Provider/database ambiguity requires exact-operation recovery.
6. Lock compatibility is source reasoning only. AUTH-02 remains deferred; no PostgreSQL/Auth/provider/browser/deployment evidence is claimed.
7. Stop after the scoped hash manifest and incremental independent-review package. Production integration and protected execution require new owner authorization.

## DEC-022 — PF-SUP-2026-10-26-01 I2 specification correction — 2026-10-26

1. State effects, durable operation results and required audit evidence are one logical model commit. Audit preparation failure leaves none of the three and cannot produce replay success.
2. Execution and recovery derive stable actor identity plus current action/mode-specific authority from an injected trusted boundary. Revoked/stale credentials fail; rotation may preserve operation identity only for the same currently authorized stable actor.
3. Operation fingerprints are SHA-256 over an explicit typed-command projection. Caller hashes and untyped fields are ignored; all effect-bearing IDs, reasons/evidence and canonical results are bound.
4. Canonical results are stored and returned as deep-immutable copies. Consumed-result recovery remains applicant-only, subject/context-bound and currently authorized.
5. The sequential race model is not PostgreSQL concurrency proof. Existing `000028`/`000029` lock behavior is documented separately from the proposed I3 hierarchy; neither migration was changed.
6. Stop after the corrected I2 manifest and independent-review package. I3 façade, role/grant and migration authoring remains unapproved.

## DEC-021 — BLK-002-I2 gateway/operator trust boundary — 2026-10-26

1. **BLK-002-I2 APPROVED:** local design, feasibility and injected contracts only. Recommended gateway authentication is a dedicated revocable short-lived workload principal mapped to a narrow façade; `service_role`, issuer-owner database login, pharmacy-user and inferred platform-admin authority are rejected.
2. **ADM-01 APPROVED:** only an explicitly permitted PharmacyFlow platform operator may approve, replace or revoke admission. Operator identity/access implementation and any privileged endpoint remain review/authorization-gated.
3. **REV-01 APPROVED:** admission revocation blocks new reservations but does not revoke existing eligibility. Eligibility revocation is explicit and separate; consumed evidence is immutable and exact replay remains available.
4. Provider exact-operation recovery and workload authentication are unverified. I2 is conditional; protected implementation, external acceptance and rollout remain blocked.
5. AUTH-02 stays owner-deferred; AUTH-03 read-only scope has no verified access method; AUTH-04 and AUTH-05 remain preparation/planning only.

## DEC-020 — BLK-002-I1 monotonic retry and authenticated recovery correction — 2026-10-25

1. Issuer retries branch on authoritative ledger state. Only `RESERVED` may advance to `AUTH_CREATE_PENDING`; pending/active/consumed retries never regress or repeat prior effects.
2. Trusted marker equality means explicit equality of identity class, issuer contract version, OWNER contract version, request ID, provider-operation ID and intended-input fingerprint. JSON encoding order and unrelated metadata have no authority.
3. Confirmation after Auth creation but before database correlation requires a distinct authenticated recovery operation bound to `auth.uid()`, subject, request, fingerprint and provider-operation ID. Email-only discovery and client assertions are insufficient.
4. The first reservation requires active closed/manual admission. Exact retry preserves the originally bound admission evidence; changed request/replacement inputs conflict. A separate eligibility revocation, not silent admission-row replacement, terminates an issued reservation.
5. Competing first reservations are modeled as request-then-email serialized with typed `OPEN_EMAIL_CONFLICT`. Static/synchronous modeling is not PostgreSQL concurrency evidence.
6. Reviewed migration `000028` and previous manifests remain historical artifacts. Corrections use forward migration `000029`; private functions retain no gateway grant and `service_role` substitution remains prohibited.

## DEC-019 — trusted OWNER eligibility issuer design gate — 2026-10-25

1. The private issuer ledger is authoritative; Auth app metadata is correlated evidence only. Client metadata and deployment booleans never grant OWNER eligibility.
2. V1 defaults to no issuance until the owner selects an admission policy. Closed allowlist/manual admission is recommended; public self-service remains unresolved.
3. Existing confirmed accounts are never reclassified by an unauthenticated request. Staff-bootstrap identities remain ineligible and use sealed M-16. Existing unconfirmed identities are recoverable only by exact provider-operation correlation.
4. Eligibility state is monotonic and immutable by request fingerprint. Revocation is pre-consumption only; replacement creates a new linked request/operation. Post-consumption tenant rollback is excluded.
5. Email confirmation precedes eligibility activation and explicit OWNER continuation. Routine session resolution remains independent.
6. A later issuer role must be `NOLOGIN NOINHERIT NOBYPASSRLS`, private-ledger scoped, and independently reviewed with all effective PUBLIC policy/default-ACL interactions. Broad `service_role` use is not approved.
7. PF-SUP-2026-10-25-15 is a design gate only. `BLK-002-I1` needs the exact separate owner approval stated in `PHARMACYFLOW_BLK002_NEXT_AUTHORIZATION_2026-10-25.md`.

## DEC-018 — BLK-002 corrected trust and rollout boundary — 2026-10-25

1. Owner Auth creation is server-first and disabled until the profile-only trigger, OWNER eligibility issuer, RPC contract and trusted identity provider are independently verified and explicitly enabled together. Public client signup is not a fallback.
2. OWNER eligibility is server-written app metadata bound to contract version, Auth subject and request ID. Confirmed identity alone is insufficient; staff-bootstrap identity is an explicit denial. Client metadata describes recovery only.
3. Normal session resolution never attempts onboarding. Explicit recovery reuses the original validated request identity and cannot block existing authoritative membership access.
4. Confirmed existing staff identities are never marked or recreated; they sign in and use sealed M-16. New/unconfirmed recovery requires exact reservation/provider-operation correlation.
5. The dedicated SQL role is proposed as `NOBYPASSRLS` with column grants and role-specific policies. This is not accepted until independent privilege/RLS review; no source assertion substitutes for database evidence.
6. Request scope is `(user_id, request_id)` and the immutable fingerprint includes contract version and scope. The canonical stored response includes server trial/completion evidence. Synchronous models are not SQL concurrency evidence.

## APP-01 through APP-07 — owner-approved policy register — 2026-10-23

- **APP-01 Secure pharmacy onboarding:** separate trusted OWNER onboarding from server-validated staff invitation acceptance. Client-selected roles never mint OWNER; invitations are tenant/role/time/replay bound. **OWNER APPROVED; local containment implemented; trusted onboarding server contract blocked pending protected design/authorization.**
- **APP-02 Subscription lifecycle:** 14-day trial, seven-day grace, then restricted mutation access with historical read/export/renewal/recovery preserved. Trusted server time is authoritative. **OWNER APPROVED; advisory client lifecycle/gating implemented; server enforcement unverified and approval-gated.**
- **APP-03 Restricted Admin Support:** minimal read-only metadata and sanitized diagnostics; no privileged mutations or RLS bypass. **OWNER APPROVED; explicit query/adapter allowlist implemented; target authorization verification pending.**
- **APP-04 Sales/Sync status v2:** additive, tenant-authorized, conservative reconciliation contract preserving Refund V2. **OWNER APPROVED; migration authored/unexecuted and external acceptance pending.**
- **APP-05 Isolated integration verification:** use a newly isolated PharmacyFlow-only disposable environment. **OWNER APPROVED AS WORKFLOW; exact proposed environment documented; creation/execution separately unauthorized.**
- **APP-06 Git release controls:** independently review a scoped snapshot and obtain owner approval before selective staging/commit. **OWNER APPROVED; no Git mutation performed.**
- **APP-07 PharmacyFlow-Dev inspection:** favor controlled read-only compatibility inspection of project `lqzsfsmppoaibnzczmhf`. **OWNER APPROVED AS WORKFLOW; connection separately unauthorized.**

APP-01 and APP-02 supersede DEC-003's pending-policy premise. APP-03 closes DEC-004's approved-field decision and its `select('*')` deferral. It does not approve new grants. APP-04 and APP-05 preserve DEC-013 through DEC-015's external-evidence boundary. StoreFlow access is permanently prohibited.

## AUTH-01 through AUTH-05 — PF-SUP-2026-10-23-06 authorization register

- **AUTH-01:** protected onboarding, membership, subscription and offline-eligibility design is approved. Safe local application integration with existing interfaces is authorized; unresolved privileged server implementation remains **BLOCKED — APPROVAL** after independent review.
- **AUTH-02:** database, SQL, migrations, Docker, cross-session concurrency and real-browser storage acceptance are **NOT RUN — OWNER DEFERRED**. This checkpoint prepares but does not repeat the execution request.
- **AUTH-03:** metadata-only inspection of PharmacyFlow-Dev `lqzsfsmppoaibnzczmhf` is conditionally authorized only through demonstrably enforced read-only access. No such method is present, so disposition is **BLOCKED — ACCESS METHOD** and no remote request occurred.
- **AUTH-04:** release preparation only. Staging, unstaging, commit, amend, push, tag, reset, clean, stash and history rewriting remain prohibited.
- **AUTH-05:** deployment and recovery planning only. Migration execution, function/client deployment and publication remain prohibited.

## DEC-017 — Capability containment and future evidence rules

- Expiry containment now covers customer/supplier mutations, new cash-shift opening and device enrollment. Historical reads remain available. Closing/reconciling a server-known existing shift and existing device security/recovery controls retain their existing role authorization; these are not treated as new enrollment or new financial activity.
- All client capability checks are advisory. Delayed mutation and restricted-draft retirement completions are invalidated by tenant, entitlement, checkout-generation and unmount changes.
- A readiness barrier is not concurrency evidence. Future acceptance must observe both named RPC sessions active plus a relevant PostgreSQL lock wait, parse exact outcomes, prove effects, and prove database sessions stopped before identity-guarded auxiliary cleanup.
- Locally frozen pre-expiry work first seen by the server after expiry remains durable and quarantined. It is not automatically completed and client time is not trusted. Bounded server-signed offline eligibility remains a separate owner decision.

## DEC-015 — PF-SUP-2026-10-23-02 closure rules

1. Initial snapshot revision contention gets one winner reload only; it never overwrites and never loops. Non-contention interruption is visible and requires explicit retry.
2. Atomic first freeze requires `DRAFT`. `LOCALLY_DURABLE` is replay-only; cancelled, acknowledged, missing and replaced ownership is rejected even at a current revision.
3. Recovery success requires independently recomputed canonical digests for both stored payload copies, matching both stored hashes and all durable identities. Recovery never repairs evidence in place.
4. Customer and product async paths share the production checkout-bound adapter. Replacement, scope change and unmount invalidate delayed lookup/create/search/barcode/duplicate-selection completions.
5. External verification follows the authored PharmacyFlow-only package and remains unexecuted until separately authorized.

## DEC-014 — PF-SUP-2026-10-22-01 closure rules — 2026-10-23

1. Lease success means IndexedDB transaction completion, not request success.
2. Cancel/acknowledge retain retired ownership; finalization never reserves, and only explicit initialization replaces a retired checkout.
3. Frozen durable checkout work blocks new mutable UI until explicit review; checkout identity changes reset customer/payment/tender/search/request state.
4. Status-v2 follows M-8/M-9 visibility: tenant-wide management, cashier-own-sale, return-author/original-cashier. Incomplete/legacy evidence is conservative; inaccessible existence never becomes absence.
5. Only M-18's `uq_sales_pharmacy_checkout_intent` is typed as `CHECKOUT_CONFLICT`; unknown `23505` remains generic. Exact operation/hash replay and rollback contracts are unchanged.
6. After identity/session checks, frozen durable evidence is retrieved before mutable validation. Frozen creation time and customer/payment evidence control readers and receipts.

These are local source/design decisions. SQL execution, database/browser/service verification and deployment remain separate owner decisions.

## DEC-016 — PF-SUP-2026-10-23-05 closure boundaries

- Invitation acceptance follows sealed M-16: transport errors, `success = false`, absent or malformed rows, OWNER evidence, inactive membership, and invalid identities fail closed. Valid `{ member_id, pharmacy_id, role, status }` evidence succeeds without an invented `success = true` requirement. Authenticated users can open the invitation form without losing a valid selected tenant; the client never supplies pharmacy or role.
- Subscription expiry is enforced at capability boundaries. Authorized historical reads and durable-sale review, recovery and acknowledgment remain reachable; new sale, inventory, refund and restock mutations are locally blocked. Acknowledging durable work while ineligible never reserves a replacement checkout.
- Every protected acceptance runner shares one explicit disposable target. Database, Edge-runtime and loopback API-gateway identities plus exact loopback bindings are verified before external access. Concurrency acceptance requires a committed readiness/overlap barrier, distinct PostgreSQL backend IDs, bounded waits, exact parsed outcomes and effect/rollback assertions.
- Forward-only onboarding and entitlement contracts are designs for review only. They do not amend sealed migrations and are not implemented or executed.
- Focused local synthetic/static evidence is executed. SQL, Docker, services, real-browser storage, cross-session concurrency, deployment and Git operations remain unexecuted and authorization-gated.

## DEC-013 — Phase B corrections are locally implemented; external proof remains separate

- Selected approach: additive IndexedDB v4 drafts use revision ownership; queue dispatch uses revision/lease CAS and never reacquires `SYNCING`; terminal resolutions are monotonic; only validated status-v2 evidence can commit or prove absence; pharmacy/record/return identity is mandatory; POS async work is generation-scoped; production sale creation requires a durable checkout while legacy tests use an explicit compatibility flag.
- Gateway decision: SQLSTATE has precedence, only exact sanitized markers are classified, unknown `23505` is generic failure, and M-18 `ALREADY_COMMITTED` requires the original committed response payload with independently valid timestamps.
- Legacy/refund decision: stock-only evidence never proves unified financial completion; incomplete legacy work remains unchanged in recovery; Refund V1/V2 contracts use operation-specific validation.
- Evidence: local TypeScript and synthetic/static suites pass, including the complete 32-suite root runner. This is not PostgreSQL, real concurrency, browser, service, or deployment evidence.
- Approval status: local implementation and forward-only migration authoring completed under the Phase B authorization. Migration execution, SQL/concurrency verification and deployment remain separately unauthorized.

DEC-006 through DEC-009 retain the historical Phase A decision trail; their “recommendation only” and “implementation blocked” wording is superseded by DEC-010 through DEC-013.

## DEC-001 — Canonical application trees

- Problem: the repository contains a root SaaS, a separate Admin Support app, and another full SaaS under `apps/pharmacy-flow saas`.
- Options: merge/rebuild; treat all as active; treat root as active and legacy tree as reference until explicitly reconciled.
- Selected approach: root `src/` is the active SaaS build target; `apps/pharmacy-flow-admin` remains the Admin Support app; preserve the other SaaS tree as reference and do not copy its contracts blindly.
- Rationale: root package scripts and recent Refund V2 changes target root `src/`; rebuilding would risk verified controls.
- Security/compatibility impact: avoids accidentally reintroducing older auth/data patterns; mobile readiness remains unresolved because Capacitor is only in the reference tree.
- Approval status: implementation working decision based on repository evidence; product owner confirmation needed before mobile integration.
- Related files/tests: root `package.json`, both app package files, `apps/pharmacy-flow saas/capacitor.config.ts`.

## DEC-002 — Preserve dirty financial/synchronization work

- Problem: the baseline contains uncommitted changes to sale payloads, dispatcher routing and the sale Edge gateway.
- Options: discard/revert; overwrite with new implementation; preserve and verify in place.
- Selected approach: preserve exactly, inspect and test; do not alter protected semantics without demonstrated defect and the required review/approval.
- Rationale: the brief identifies concurrent checkout/sync work and forbids destruction; changes introduce `checkout_intent_id` and `rpc_commit_sale_v1` integration.
- Security/compatibility impact: prevents lost work and accidental contract regression; leaves MVP-03/04 unverified until reviewed.
- Approval status: required preservation rule; no Git action authorized.
- Related files/tests: `src/lib/offline/dispatcher.ts`, `src/lib/sales/service.ts`, `src/lib/sales/types.ts`, `supabase/functions/sync-push-sale/*`.

## DEC-003 — Fail closed on unresolved product policy

- Problem: onboarding distinguishes neither pharmacy owners nor invited staff, and operational subscription denial/grace rules are undefined.
- Options: infer a policy; allow permissive behavior; record blockers and continue independent safe work.
- Selected approach: do not invent onboarding or entitlement semantics. Record focused approvals, continue safe Admin/UI/testing work, and keep database/financial contracts unchanged.
- Rationale: both choices change privilege/commercial boundaries and are explicitly protected.
- Security/compatibility impact: avoids privilege expansion and accidental tenant lockout; MVP-01 and MVP-08 cannot be verified yet.
- Approval status: pending product-owner decisions and independent review.
- Related files/tests: M-2 `handle_new_user`, M-3 `is_subscription_active`, M-16 invitation RPCs, `AuthScreen.tsx`, `AuthContext.tsx`.

## DEC-004 — Admin Support data-honesty boundary

- Problem: missing configuration/fetch failures generated synthetic accounts, while successful reads were enriched with invented subscription, expiry, price and location values and local-only actions claimed success.
- Options: retain/label demo behavior; selectively hide unsupported fields; reduce the operational surface to explicit read readiness until authoritative mappings and action contracts exist.
- Selected approach: fail closed for missing/error/invalid responses; distinguish a successful empty response; preserve only returned identifier/name fields; show unsupported metadata as unavailable; disable privileged actions. Mock generators remain isolated fixtures and are not imported by the operational dashboard.
- Rationale: support decisions must not be based on fabricated tenants, subscriptions, payments, financial zeros, or client-only mutation claims.
- Security/compatibility impact: reduces operational deception and prevents local mock actions from appearing authoritative; no query, privilege, persistence or backend contract was added.
- Data-minimization note: the preserved query remains `select('*')`. The adapter displays only identifier/name, but over-fetching is unresolved; narrowing the query is deferred until the metadata response contract is reviewed.
- Approval status: authorized low-risk local implementation; independent admin-boundary review still required before release.
- Related files/tests: `apps/pharmacy-flow-admin/components/Dashboard.tsx`, `apps/pharmacy-flow-admin/lib/admin-data-readiness.ts`, `apps/pharmacy-flow-admin/lib/dashboard-data-boundary.test.mjs`, admin build/type-check/lint.

## DEC-005 — Portable local TypeScript test execution

- Problem: the installed `tsx` launcher fails before test execution on this Windows host because `uv_os_get_passwd` returns `ENOMEM`.
- Options: leave all tests blocked; rewrite extensionless imports; use a repository-scoped loader with Node and the already-installed esbuild transformer.
- Selected approach: run the existing suites unchanged through Node with `scripts/typescript-loader.mjs`, which resolves local `.ts`/`.tsx` paths and erases TypeScript syntax with the locked esbuild dependency.
- Rationale: this avoids a host-specific temporary-directory/user-info failure and preserves the application test bodies.
- Security/compatibility impact: no runtime or protocol change; the Node loader flag is experimental and should be replaced when a stable registration API or healthy `tsx` runtime is available.
- Approval status: authorized local test-tooling change.
- Related files/tests: root `package.json`, `scripts/run-tests.ts`, `scripts/typescript-loader.mjs`; fresh 10/10 critical and 31/31 full results.

## DEC-006 — Protected unified-sale defects remain characterization-only

- Problem: static and synthetic evidence shows legacy checkout-intent failure, production error-shape loss, test/SQL replay mismatch, fabricated RPC success, and unstable POS checkout identity.
- Options: patch individual symptoms now; ignore them because ordinary suites pass; characterize the interacting contract and request one reviewed implementation decision.
- Selected approach: add an isolated executable characterization and remediation analysis, but do not edit the protected auth, financial, signed-payload, queue, gateway, RPC or migration implementation without approval.
- Rationale: the defects are consequential and coupled. Piecemeal changes could rewrite signed history, create duplicate financial effects, or convert uncertain outcomes into false success.
- Security/compatibility impact: no runtime behavior changes. **6/6 characterization passing means six unsafe observations remain. There are two synthetic behavioral checks and four source-text checks across five defect families. This is not SQL or concurrency verification.** The unified sale path is not release-ready merely because earlier ordinary suites passed.
- Approval status: recommended cohesive remediation batch awaiting owner approval and independent financial/security review. Database execution remains separately approval-gated.
- Related files/tests: `scripts/protected-sales-sync-characterization.ts`, `docs/development/PHARMACYFLOW_PROTECTED_SALES_SYNC_DEFECTS.md`.

## DEC-007 — Checkout identity contract recommendation

- Problem: the current POS does not retain checkout identity, while M-18 and the gateway test disagree on same-intent/different-operation behavior.
- Options: treat same intent with any new operation as success; bind intent and operation at first persistence; invent a server equivalence mechanism.
- Selected approach: recommendation only - create one intent before first finalize, bind it to one `client_op_id`, reuse both through retry/restart, accept exact replay, and report same-intent/different-operation as an explicit conflict.
- Rationale: this matches immutable signed payloads and avoids declaring two different signed operations equivalent without a proof contract.
- Security/compatibility impact: would require coordinated protected client/gateway/RPC/test changes and possibly an additive migration; historic signed records must remain unchanged.
- Approval status: pending product-owner approval and independent financial/security review; not implemented.
- Related files/tests: POS cart/orchestrator/view, sales service, dispatcher, sale gateway, M-18, protected defect report.

## DEC-008 — Explicit uncertain outcome and reconciliation contract

- Problem: current recovery maps missing/null lookup evidence to `NOT_COMMITTED` and retries all non-committed outcomes, including `UNKNOWN`.
- Options: retain binary committed/not-committed; treat every lookup failure as retryable; introduce five authoritative outcomes and block submission until absence is proven.
- Selected approach: recommendation only — use `CONFIRMED_COMMITTED`, `CONFIRMED_ABSENT`, `IN_PROGRESS`, `CONFLICT`, and `UNKNOWN`; UNKNOWN never becomes ABSENT and cannot dispatch automatically. Apply queue/transaction/result resolution atomically in local storage.
- Rationale: network response loss and malformed/unauthorized status lookups can follow a real server commit. Resubmitting without proof can duplicate financial or inventory effects.
- Security/compatibility impact: requires protected dispatcher/state/persistence changes and Refund V2 regression coverage. No change was implemented in Phase A.
- Approval status: **BLOCKED — APPROVAL**.
- Related files/tests: `src/lib/offline/dispatcher.ts`, `stateMachine.ts`, `db.ts`, `types.ts`, `src/components/OfflineSyncRuntime.tsx`, Phase B design.

## DEC-009 — Additive storage and status evidence are required

- Problem: current IndexedDB has no checkout-draft store, while the existing status RPC cannot distinguish authorized absence or return enough unified-sale identity/effect evidence.
- Options: reuse unrelated existing stores and infer absence; keep recovery blocked permanently; add narrowly scoped versioned capabilities.
- Selected approach: recommendation only — add an IndexedDB v4 `checkout_drafts` store and author a forward-only `rpc_get_client_op_status_v2` migration. Do not edit sealed M-6/M-10/M-18. Do not implement an automated legacy completion endpoint in the initial batch.
- Rationale: durable pre-finalize identity requires local persistence; safe reconciliation requires authoritative operation kind, hash, sale/checkout and visibility outcomes. M-18's existing direct result remains sufficient for strict immediate-response validation when complete.
- Security/compatibility impact: IndexedDB upgrade needs non-destructive migration and multi-tab tests. The RPC needs explicit authorization, tenant scoping and security review. Migration execution and deployment remain separate approvals.
- Approval status: authoring and protected implementation are **BLOCKED — APPROVAL**; database execution is separately **BLOCKED — APPROVAL**.
- Related files/tests: `src/lib/offline/db.ts`, `src/lib/pos/`, M-6, M-10, M-18, `PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`.

## DEC-010 — Freeze the first durable checkout payload

- Selected approach: one pharmacy/branch/cashier draft reserves checkout, operation, sale, line and creation identities. The first finalization atomically freezes payload/hash with transaction and queue; later finalization retrieves that operation and cannot replace its identities or bytes.
- Rationale: UI failure, restart, competing tabs, validation failure, acknowledgment and scope changes must not create a second financial intent or delete unresolved work.
- Evidence: implemented IndexedDB v4 and POS/sales source; executed fake-IndexedDB acceptance. Browser IndexedDB remains unexecuted.

## DEC-011 — Unknown is never absence

- Selected approach: only an authorized status-v2 `CONFIRMED_ABSENT` row can restore exact frozen work to retryable. Response loss, malformed success, missing RPC deployment, denial, no resolver and invalid evidence remain `UNCERTAIN`; legacy stock-only work is `RECOVERY_REQUIRED`.
- Rationale: a server commit can precede response loss or client validation failure.
- Evidence: implemented dispatcher/protocol/runtime and synthetic regressions. Status-v2 SQL is authored but unexecuted.

## DEC-012 — Validate M-18 and preserve Refund contracts

- Selected approach: unified success requires authoritative operation/sale/checkout/timestamp agreement. M-18 replay accepts top-level `ALREADY_COMMITTED` only with the original committed response payload. Error normalization uses a sanitized allowlist. Refund V1 retains its response adapter and Refund V2 retains its request/signature/response contract with operation-specific validation.
- Evidence: gateway and shared-dispatcher synthetic regressions pass; database/Edge execution and concurrency verification remain pending.

## DEC-013 — ACC-01 fail-closed acceptance boundary

- Selected approach: a later execution envelope must bind one exact disposable PharmacyFlow target, complete runner/source/migration hashes, exact scenario-body hashes, command and fixture scopes, sanitized evidence root and fixture-only cleanup before an injected side-effect executor can run.
- Recovery rule: `FOUND` may finalize only the original durable binding under current recovery authority. `UNKNOWN`, timeout, malformed evidence and `PROVEN_ABSENT` never cause a second create.
- Pending owner choice (`REV-LIN-01`): approve transaction-entry authority-check linearization or authorize a stronger fencing/cancellation SQL design. ACC-01 does not choose silently.
- Evidence: pure/injected/static/type checks only. Documentation research is not sandbox authorization; no PostgreSQL/Auth/provider/browser acceptance was run.

## DEC-014 — Pin destination proof and separate narrow command authority

- Future database access must use explicit loopback host/port/database/user arguments, a pinned client executable, an ephemeral credential-file path and an authoritative pre-existing target marker plus system identifier/database OID proof. Service aliases and ambient libpq routing are prohibited.
- Authorizations grant only a selected command subset with exact per-command permissions. Fixture creation, assertions, concurrency, fixture cleanup and environment destruction are independent scopes.
- Shared harness tables are never dropped by fixture cleanup; immutable or unresolved evidence blocks deletion. Cancellation without verified backend exit, lock release and scenario-specific rollback absence is not PASS.
- REV-LIN-01 remains undecided. Simulated database claims are not JWT/Auth acceptance.

## DEC-028 — Coordinator mutation and advisory-lock component contracts

- Coordinator evidence mutations must return one aggregate acknowledgment and validate the exact affected-row cardinality. A silent UPDATE or unvalidated `RETURNING` set cannot advance concurrency proof state.
- The signed 64-bit advisory key maps to `pg_locks.classid` and `objid` as unsigned high/low 32-bit components. Session and coordinator SQL must be generated by the same source helper; direct narrowing through signed `int` is prohibited.
- Local arithmetic, source assertions and parser checks do not establish PostgreSQL `pg_locks` parity. That remains protected acceptance evidence.
- AUTH-02 and REV-LIN-01 are unchanged.

## DEC-027 — Concurrency evidence must originate from production boundaries

- Executable ACC-01 concurrency cases must invoke the actual application RPC and prove the blocker/waiter pair on the lock acquired by that RPC. A harness-created serializing lock or direct business-row mutation cannot establish application concurrency acceptance.
- Pending-first and completed-first operation collisions meet the source-design requirement. Durable recovery has no observable recovery lock, reservation/revocation needs an additionally reviewed committed-fixture lifecycle, and consumption requires prohibited confirmed-Auth fixtures; those cases remain sequential, blocked or not implemented.
- PostgreSQL stdout has one typed envelope, while command tags, notices, diagnostics and stderr remain separate. Structured evidence is recursively sanitized before serialization.
- REV-LIN-01 is unchanged and undecided. This local decision creates no database, Auth, provider or execution authority.

## DEC-029 — Reservation/admission-revocation concurrency contract

- Existing source supplies one genuine shared lock: both `rpc_gateway_reserve_owner_eligibility_v2` and `rpc_platform_owner_admission_decide_v2(..., 'REVOKE', ...)` reach `pg_advisory_xact_lock(hashtextextended(email_digest, 1))` before inspecting or updating the admission.
- A committed active-admission fixture must be created through the admission RPC. Direct inserts into admission, decision, operation or eligibility business tables are not valid setup evidence for these cases.
- Reservation-first linearizes while admission is active, so the request remains `RESERVED` even though the later admission revocation succeeds. Revocation-first makes the admission inactive, so the later reservation must fail `PI010` without a security operation or request.
- Outcome-specific authoritative counts and exact final-state predicates supplement blocker/waiter proof. Cleanup refuses immutable fixture/scenario evidence; disposable-environment destruction remains a separate scope.
- This decision concerns applicant admission state, not authority-credential revocation. It does not decide REV-LIN-01. PostgreSQL behavior remains **NOT RUN** and AUTH-02 remains deferred.

## DEC-030 — REV-LIN-01 transaction-entry linearization approved

- Each independently invoked privileged phase revalidates trusted identity, active state, exact credential version and action permission at its authoritative entry. A phase accepted there may finish its bounded transaction despite later credential revocation; later phases and calls must reauthorize.
- Pending operations and queue/request evidence are not continuing authority. Provider dispatch and exact provider resolution are separate authority boundaries. Already-dispatched effects retain immutable operation/fingerprint/provider correlation and are never blindly repeated.
- Revoked credentials cannot recover or replay. A different currently authorized `IDENTITY_RECOVER` principal may resolve the original operation; original authorship remains immutable and the recovery actor/version must be audited separately. Recovery-only authority cannot create identities.
- Source reconciliation found missing dispatch/resolution rechecks and recovery-actor/original-actor conflation. REV-LIN-01 is **OWNER APPROVED — IMPLEMENTATION CORRECTION REQUIRED — NOT DATABASE VERIFIED**. AUTH-02 remains deferred.

## DEC-031 — REV-LIN-01 phase authority and immutable recovery provenance

- Selected approach: every independently invoked identity begin, dispatch, exact resolution, completion and result-lookup phase revalidates current action-specific authority. New dispatch uses `IDENTITY_ISSUE`; restart/uncertainty resolution uses `IDENTITY_RECOVER`.
- Identity rule: original principal, credential version, complete normalized command fingerprint and provider correlation come from the durable attempt. A different recovery actor is never substituted into original authorship and is recorded separately in append-only audit.
- Access rule: identity phases require active applicant/context scope in addition to principal status, exact credential version and capability. The new registry is empty and unprovisioned by design.
- Legacy rule: incomplete pre-000033 provenance fails as `LEGACY_ISSUANCE_PROVENANCE_INCOMPLETE`; no credential version is fabricated.
- Atomicity rule: correlation, operation/result persistence, attempt completion and required audit share a transaction. Recovery never creates, and unknown/absence remains unresolved.
- Evidence: focused injected/static/compiler checks only. Migration `000033` is unexecuted; PostgreSQL/Auth/provider/browser/concurrency acceptance remains open under deferred AUTH-02.

## DEC-032 — ACC-01 follows the current v4 identity contract without fabricating Auth evidence

- The executable identity ACL matrix uses only the public v4/phase/result signatures introduced by `000033`; all superseded identity routes are explicit denial expectations after `000034`.
- Disposable acceptance scope grants are exact run-owned fixtures. They are not production authority provisioning, cannot be silently adopted and are removed before their referenced authorities only when no immutable/unresolved dependency exists.
- Pending phase authorization, cross-principal ISSUE denial and scoped RECOVER lookup can be authored without Auth. Successful completion, completed replay and completion-audit rollback cross the trusted `auth.users` marker boundary and remain `BLOCKED_AUTH_02`; direct Auth-row insertion is not an acceptable substitute.
- v4 recovery now exposes the operation advisory lock, but recovery concurrency remains `NOT IMPLEMENTED` until its provider-resolution outcomes and committed pending-fixture lifecycle are separately reviewed. No PostgreSQL behavior is inferred from local source checks.

## DEC-033 — Entitlement foundation is evidence-bound and unwired

- Authoritative evidence must match the requested pharmacy and a complete, internally consistent strict-timestamp lifecycle contract.
- Expired-state replay requires exact committed evidence bound to operation kind, client identity, tenant, actor/device and payload fingerprint; a boolean or domain ID is insufficient.
- Administrative decisions use effective instant, monotonic sequence and UUID ordering. Renewal alone does not override suspension or a negative mutation decision.
- Migration `000036` remains private, additive and unexecuted. It is not enforcement until protected route wiring is separately authorized and accepted.

## DEC-034 — Foundation acceptance uses v2 evaluation and full-scope proof consumption

- Authorization is consumed only with the current pharmacy, operation kind, client operation identity, actor/device and payload fingerprint; partial and boolean replay claims are invalid.
- Administrative instants compare at six-digit microsecond precision, then sequence and UUID, matching the authored PostgreSQL ordering.
- `000035` remains byte-preserved at the documented foundation hash. Additive `000037` revokes superseded callable helpers, avoids definer-owner trust and defines v2 evaluation/private proof surfaces without business-route wiring.
- Reinstatement removes an administrative denial but cannot manufacture a valid commercial period. Trusted committed evidence must eventually be written atomically by separately authorized business-route wiring.

## DEC-035 — PF-MVP-09/R/S is quarantined; additive files cannot repair an earlier parse failure

- The executable lineage stops before malformed `20261029000037_consolidated_entitlement_enforcement_v1.sql`; later files cannot repair a parser stop.
- Competing migration bytes and historical manifests remain evidence and are not silently normalized. “PROPOSED OWNER AUTHORIZATION” is not treated as owner approval.
- Any replacement must derive from M-18 and Refund V2 including M-21–M-25, plus sealed M-13–M-16 contracts. Delegated/role-string trust is not sufficient without actor/tenant/branch/device provenance and exact replay proof.
- Owner must explicitly authorize replacement-in-place or moving/renaming the malformed artifact before further wiring source is authored.
## DEC-039 - PF-SUP-2026-10-30-03 entitlement precedence and replay decisions

- The latest effective administrative decision is ordered by full PostgreSQL timestamp precision, then monotonic sequence, then UUID. Future decisions do not participate.
- `SUSPEND` and `DENY_MUTATIONS` block. `REINSTATE` and `ALLOW_MUTATIONS` remove the administrative overlay but never override invalid, missing, cancelled, expired or out-of-grace commercial evidence.
- Historical suspension anchors are immutable. If no effective administrative decision exists, any historical suspension remains fail-closed; an explicit later positive decision supersedes that overlay without deleting history.
- M-9 remains available to authenticated callers but has no expired replay path because its signature contains no payload fingerprint. No replay evidence is invented.
- Wrapper evidence fingerprints must be byte-equivalent to each sealed operation's canonicalization. Equivalent reordered/defaulted M-13 intake requests remain equivalent; material changes conflict.
- Direct-table enforcement is not decided by this milestone.
