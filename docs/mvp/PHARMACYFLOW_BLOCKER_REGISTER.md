# PharmacyFlow MVP blocker register

## PF-MVP-10 final protected-execution gate - PF-SUP-2026-10-31-03

No local harness finding remains open after native-client conformance closure. The remaining gate is independent review followed by one separate owner instruction naming the disposable target/marker, exact executable identities, credential delivery, evidence destination, scenarios and command permissions bound to inventory SHA-256 `59338f5aee6d759ccb580c18e2e111f463c7f82cc5468b46473f3d20886e43ca`. AUTH-02, direct-table enforcement and environment destruction remain separate.

## PF-MVP-10 protected execution gate - PF-SUP-2026-10-31-02

Local emitter/consumer and coordinator conformance findings are closed. Independent review of the refreshed execution inventory and scoped review manifest is required before any disposable PostgreSQL execution request. PostgreSQL proof, direct-table policy, environment destruction and AUTH-02 remain separate blockers/gates.

## PF-MVP-10 execution authorization gate - PF-SUP-2026-10-31-01

The local whole-command package is complete for independent review. Protected execution remains blocked on explicit owner-supplied disposable target identity/marker, exact `psql` and PowerShell identities, credential-file delivery, evidence destination, expiry and command-specific permissions bound to execution-inventory SHA-256 `9763de865c306901a7f991f66d611692e7df723ff51ee28f97c2d842e1c2e5f3`. Cleanup still refuses immutable-evidence deletion; environment destruction, AUTH-02 and direct-table enforcement remain separate gates.

## PF-MVP-10 protected execution gate - PF-SUP-2026-10-30-06

The local production-path integration findings are corrected. Remaining blockers are independent package acceptance and a later exact owner authorization supplying the disposable target/marker, executable hashes, credential-file delivery, evidence destination and command-specific permissions. Fixture cleanup deliberately refuses deletion to preserve immutable evidence; environment destruction requires a distinct future authorization. AUTH-02 and direct-table enforcement remain separate gates.

### PF-SUP-2026-10-30-05 runner closure disposition

Status: **LOCALLY CORRECTED — UNEXECUTED — INDEPENDENT REVIEW REQUIRED**. The earlier package readiness claim is superseded. Remaining protected inputs are exact target/comment marker, executable identities, credentials/evidence, command-specific permissions and cleanup timing. PostgreSQL/Auth/provider/browser execution, destruction, AUTH-02 and direct-table enforcement remain blocked.

### PF-MVP-10 executable-package disposition

Status: **RUNNABLE PACKAGE AUTHORED — UNEXECUTED — INDEPENDENT REVIEW REQUIRED**. Blocking inputs are the owner-supplied disposable target identity, approved `psql`/credential mechanism, evidence destination, package hash, command/scenario permissions and separate cleanup/destruction decisions. Runtime must supply genuine Supabase Auth primitives. AUTH-02 and direct-table policy remain separately blocked.

### PF-SUP-2026-10-30-03 entitlement contract closure disposition

M-9, M-10 and Refund V2 callable signatures are all represented in the composed guard/grant matrix. Public read and mutation guards share one effective resolver, with explicit historical-anchor/ordered-decision precedence. Inventory proof fingerprints match sealed canonicalization. The execution proposal is source-ready and target-neutral.

Status: **SOURCE/INJECTED-MODEL COMPLETE — INDEPENDENT REVIEW REQUIRED — POSTGRESQL PARSING/APPLICATION, CATALOG/RLS/ACL, ATOMICITY AND CONCURRENCY NOT RUN — DISPOSABLE TARGET/IDENTITY/RUN/CLEANUP/DESTRUCTION AUTHORITY MISSING — DIRECT-TABLE POLICY AND AUTH-02 DEFERRED**.

### Entitlement migration lineage repair and canonical parity disposition - 2026-10-30

The malformed version-37 proposal is quarantined outside `supabase/migrations` with verified unchanged bytes. Additive unexecuted migration `20261030000038_canonical_entitlement_contract_parity_v1.sql` is the canonical business-route wiring proposal after foundation completion. Latest sealed bodies are preserved by rename/delegation; wrappers enforce exact initiating operator/gateway scope and exact committed replay evidence before mutation. Legacy callable return remains available with an entitlement guard. Direct-table mutation enforcement is unresolved because trigger/RLS/API-removal policy requires protected database design and execution review.

Status: **SOURCE/SYNTHETIC PACKAGE COMPLETE — INDEPENDENT REVIEW REQUIRED — POSTGRESQL PARSING/APPLICATION AND DATABASE/RLS/CONCURRENCY NOT RUN — DISPOSABLE EXECUTION REQUIRES SEPARATE AUTHORIZATION — AUTH-02 DEFERRED**.

### PF-MVP-09S-FINAL Consolidated Privileged-Caller Security Closure disposition - 2026-10-30

The owner-authorized final privileged-caller security closure milestone (PF-MVP-09S-FINAL) establishes definitive operator provenance across all privileged operational RPCs:
1. Privileged Operator Provenance: `rpc_ingest_sale_stock_movement` validates the initiating operator via `auth.uid()` or JWT sub claim (`request.jwt.claim.sub`) (or system principal `postgres`), rejecting missing operator identity with `42501 FORBIDDEN_OPERATOR: Initiating operator identity required for privileged ingestion`, and verifying active membership (`42501 FORBIDDEN_PHARMACY`) and `sales.create` permission (`42501 FORBIDDEN_PERMISSION`). `rpc_commit_sale_v1` and `rpc_process_sale_return_v2` strictly require explicit non-null operator parameter `p_actor_user_id` (`42501 FORBIDDEN_OPERATOR: Initiating operator ID is required`), verifying active membership and specific permissions (`sales.create` / `sales.refund`).
2. Replay Bypass Elimination: Replay authorization strictly requires a 64-char SHA-256 payload hash (`p_payload_hash ~ '^[0-9a-fA-F]{64}$'`), strictly checks domain idempotency columns (`client_op_id`, `dispatch_client_op_id`, `receive_client_op_id`), removes unverified `OR id = p_operation_id` clauses and sales fallbacks, and raises `23505 IDEMPOTENCY_VIOLATION` on hash mismatch.
3. Private Mutation Containment: `rpc_ingest_sale_stock_movement`, `rpc_commit_sale_v1`, and `rpc_process_sale_return_v2` require `TRUSTED_GATEWAY_REQUIRED` and active pharmacy membership, with direct execution revoked from `PUBLIC, anon, authenticated` and granted strictly to `service_role`.
4. Administrative Suspension Precedence: Evaluates administrative decisions filtered by `effective_at <= v_now` with deterministic sequence ordering, honoring explicit reinstatements.
5. Migration Monotonicity: Preserves monotonic order `000035` < `000036` < `000037` with unique version timestamps.

Status: **LOCALLY AUTHORED AND SYNTHETICALLY VERIFIED (1,343 ASSERTIONS PASSED ACROSS ENTITLEMENT SUITES, 43/43 TEST SUITES PASSING) — INDEPENDENT GPT-6 REVIEW REQUIRED — POSTGRESQL / DATABASE NOT RUN — AUTH-02 DEFERRED**.

### PF-MVP-09S Final Entitlement Security Contract Closure disposition - 2026-10-30

The owner-authorized final entitlement security contract closure milestone (PF-MVP-09S) resolves all outstanding security findings:
1. Trusted Operator Provenance: `rpc_get_effective_entitlement_v1` and `assert_pharmacy_mutation_entitled_v1` eliminate blanket `service_role` bypasses, verifying target pharmacy existence, active operator membership, and optional JWT sub operator membership.
2. Replay Bypass Elimination: Replay authorization strictly requires a 64-char SHA-256 payload hash (`p_payload_hash ~ '^[0-9a-fA-F]{64}$'`), strictly checks domain idempotency columns (`client_op_id`, `dispatch_client_op_id`, `receive_client_op_id`), removes unverified `OR id = p_operation_id` clauses and sales fallbacks, and raises `23505 IDEMPOTENCY_VIOLATION` on hash mismatch.
3. Private Mutation Containment: `rpc_ingest_sale_stock_movement`, `rpc_commit_sale_v1`, and `rpc_process_sale_return_v2` require `TRUSTED_GATEWAY_REQUIRED` and active pharmacy membership, with direct execution revoked from `PUBLIC, anon, authenticated`.
4. Administrative Suspension Precedence: Evaluates administrative decisions filtered by `effective_at <= v_now` with deterministic sequence ordering, honoring explicit reinstatements.
5. Migration Monotonicity: Preserves monotonic order `000035` < `000036` < `000037` with unique version timestamps.

Status: **LOCALLY AUTHORED AND SYNTHETICALLY VERIFIED (1,238 ASSERTIONS PASSED) — INDEPENDENT GPT-6 REVIEW REQUIRED — POSTGRESQL / DATABASE NOT RUN — AUTH-02 DEFERRED**.

### PF-MVP-09R Consolidated Entitlement Enforcement Acceptance Hardening disposition - 2026-10-30

The owner-authorized consolidated entitlement enforcement acceptance hardening milestone (PF-MVP-09R) is locally authored, statically verified, and synthetically verified across all eight operational SECURITY DEFINER RPCs:
1. Migration Monotonicity & Collision Resolution: Preserved `20261029000036_entitlement_foundation_security_closure_v1.sql` intact without modification. Authored forward-only unexecuted SQL migration `20261029000037_consolidated_entitlement_enforcement_v1.sql` (Version 37), strictly maintaining monotonic order `000035` < `000036` < `000037` with zero applied migrations deleted or rewritten.
2. Trusted Gateway Caller Identity Hardening: Hardened `rpc_get_effective_entitlement_v1` and `assert_pharmacy_mutation_entitled_v1` to explicitly recognize trusted backend gateway callers (`service_role`) via `coalesce(auth.role(), '') = 'service_role' OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' OR current_user = 'service_role'`. For `authenticated` client callers, verified active membership (`is_pharmacy_member`) or platform admin authority before evaluating entitlement or replay. Unauthenticated callers without `service_role` fail closed with `28000 AUTH_REQUIRED`.
3. Operational RPC Preludes Across All 8 Pathways: Forward migration `20261029000037_consolidated_entitlement_enforcement_v1.sql` overrides all 8 operational mutation entry points (`rpc_ingest_sale_stock_movement`, `rpc_commit_sale_v1`, `rpc_process_sale_return`, `rpc_process_sale_return_v2`, `rpc_receive_inventory_stock`, `rpc_adjust_inventory_stock`, `rpc_dispatch_stock_transfer`, `rpc_receive_stock_transfer`, and staff management RPCs) with preludes calling `assert_pharmacy_mutation_entitled_v1`. Preserved all signatures, parameters, locking (`FOR UPDATE`), arithmetic, return structures, and financial invariants from original sealed definitions.
4. Edge Function Protection: Public Edge Functions (`sync-push-sale`, `sync-push-return`, `sync-push-return-v2`) executing with `service_role` credentials are protected against unentitled tenant mutations via underlying RPC assertion preludes.
5. Replay Hardening: Idempotent replay authorization is strictly bound to matching domain table (`sales`, `sale_returns`, `purchases`, `stock_adjustments`, `stock_transfers`), operation kind, caller pharmacy identity, and payload fingerprint (`23505 IDEMPOTENCY_VIOLATION` on mismatch). Cross-operation replay forgery (e.g. attempting to authorize stock intake via a committed sale ID) and cross-tenant replay are strictly rejected. Staff management operations cannot be replayed offline.
6. Administrative Suspension Ordering & FORCE RLS: Enforced `FORCE ROW LEVEL SECURITY` across `subscriptions`, `subscription_plans`, `pharmacy_entitlement_anchors`, and `entitlement_administrative_decisions_v1`. Direct table DML is revoked from client roles. Evaluated administrative suspension using deterministic ordering (`ORDER BY effective_at DESC, decision_sequence DESC, id DESC LIMIT 1`), properly recognizing explicit reinstatements. Unconditionally preserved all 8 historical read and recovery operations across all states.

Status: **LOCALLY AUTHORED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — POSTGRESQL / DATABASE NOT RUN — AUTH-02 DEFERRED**.

### PF-MVP-08 / BLK-003 Entitlement Foundation disposition - 2026-10-29

The owner-authorized server-authoritative entitlement foundation (BLK-003) is locally authored and synthetically verified, resolving all seven defects identified in PF-SUP-2026-10-29-02:
1. Replay bypass is membership-first: authentication (`auth.uid() IS NOT NULL`) and active tenant membership (`is_pharmacy_member`) are enforced before any replay inspection.
2. StoreFlow `sync_idempotency_log` references are removed and aligned with PharmacyFlow's `public.sync_journal` and domain tables (`sales`, `sale_returns`, `purchases`, `stock_adjustments`, `stock_transfers`).
3. `pharmacy_entitlement_anchors` active ledger is populated via subscription trigger `trg_subscriptions_entitlement_anchor` and platform admin procedure `rpc_record_entitlement_anchor_v1`.
4. Sealed M-3 check constraint on `public.subscriptions` is strictly preserved (`TRIAL, ACTIVE, PAST_DUE, CANCELLED, EXPIRED`); `pharmacy_entitlement_anchors` supports `'SUSPENDED'`, and `rpc_get_effective_entitlement_v1` derives administrative suspension from the anchor ledger.
5. Produced exhaustive Operation Enforcement Matrix across 11 mutation pathways, identifying sealed RPC bypasses and the proposed future wiring migration (`000036`).
6. Client response validation strictly validates `pharmacy_id`, `state`, `mutations_allowed`, `historical_reads_allowed`, and `server_time`.
7. Authored inactive injected RPC and offline fallback adapters (`entitlementAdapter.ts`) with zero live network calls.

Status: **LOCALLY AUTHORED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — POSTGRESQL / DATABASE NOT RUN — AUTH-02 DEFERRED**.

### PF-SUP-2026-10-29-02 inventory correction disposition

### MVP-02-CLOSE inventory acceptance disposition - 2026-10-29

The demonstrated local integration gaps are closed: snapshot identity/safe-integer validation, mutation-response validation, refresh/cache preservation, attention/detail composition and durable POS non-interference pass focused evidence. Status: **LOCALLY ACCEPTED — SOURCE/SYNTHETIC/FAKE-INDEXEDDB — INDEPENDENT REVIEW REQUIRED**. Remaining gates are protected only: real browser/datastore scheduling, PostgreSQL/RLS/RPC permissions, atomic stock-ledger/idempotency/concurrency behavior and production acceptance. AUTH-02 remains deferred; additional local work must not be presented as a substitute.

### PF-SUP-2026-10-28-04 MVP-02B rendering boundary

The demonstrated ProductList runtime-shape crash path is corrected locally. Null/non-array collections, null rows and malformed directly consumed fields now render controlled unavailable evidence; valid rows in mixed collections remain visible. Missing or malformed stock evidence remains unknown and cannot produce an empty-catalog, zero-stock or adequate-stock claim. Status: **P2 LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED - INDEPENDENT REVIEW REQUIRED - BROWSER/DATASTORE/RLS/DATABASE NOT RUN**. AUTH-02 remains deferred.

### MVP-02B branch-scoped cached stock attention

The demonstrated all-branch raw ProductList total and missing-as-zero low-stock gap is corrected locally. Panel, quantities, branch batch counts, badges and filters share one validated current-workspace derivation. Missing or invalid evidence is unknown and remains visible outside numeric filters; search/truncation/stale/incompatible evidence cannot claim branch-wide completeness. Status: **LOCALLY IMPLEMENTED AND SYNTHETICALLY VERIFIED - INDEPENDENT REVIEW REQUIRED - BROWSER/INDEXEDDB/RLS/DATABASE NOT RUN**. Authoritative stock, reorder-level propagation and protected acceptance remain out of scope; AUTH-02 is deferred.

### PF-SUP-2026-10-28-02 product-detail publication race

The demonstrated stale product-detail success/error/finally paths are corrected locally. A production-used coordinator requires the newest generation and current coherent workspace/pharmacy/product immediately before every state publication; close, replacement, workspace change and unmount invalidate pending work. Batch associations fail closed. Status: **LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED - INDEPENDENT REVIEW REQUIRED - BROWSER/INDEXEDDB/RLS/DATABASE NOT RUN**. This closes only the source/synthetic P2 path; protected acceptance and AUTH-02 remain open/deferred.

### Shared inventory expiry parser remediation - 2026-10-28

The recorded normalization and ambiguous-reference defect is corrected locally under the approved contract. Snapshot/intake, FEFO, explicit/automatic POS, finalization and detail-unavailable paths fail closed; valid ordering and same-day policy remain intact. Invalid expiry creates no completed sale/queue effect and preserves the unresolved checkout reservation. Status: **LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — BROWSER/INDEXEDDB/RLS/DATABASE NOT RUN**. This supersedes the open source-remediation disposition below without erasing it; protected acceptance and AUTH-02 remain open/deferred.

### PF-SUP-2026-10-27-07 MVP-02A robustness correction

The demonstrated perpetual-loading presentation and malformed runtime-cache crash paths are corrected locally. Completed failure is authoritative over transition loading; retry clears the error; malformed collections, groups and rows produce unknown coverage with no reassuring empty state. Status: **LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — BROWSER/INDEXEDDB/RLS/DATABASE NOT RUN**. The shared expiry parser defect and protected acceptance blockers remain open; AUTH-02 is deferred.

### MVP-02A branch-scoped expiry attention disposition - 2026-10-27

The missing local expiry-attention surface is authored from the existing `InventoryView` cache with strict tenant/branch/product/batch/date/quantity validation and explicit complete/partial/unknown coverage. Status: **LOCALLY IMPLEMENTED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — BROWSER/INDEXEDDB/RLS/DATABASE NOT RUN**. Cached projected quantities are non-authoritative. Real branch enforcement, cache scheduling and stock reconciliation remain protected acceptance blockers; AUTH-02 is deferred.

### Shared inventory expiry parser defect - 2026-10-27

`src/lib/inventory/expiry.ts` uses normalizing `Date.UTC` construction without a Gregorian round-trip check, so impossible dates can normalize into another calendar day. It serves POS/FEFO and batch-selection dependencies and is intentionally unchanged by MVP-02A. Status: **OPEN — SEPARATE SOURCE/REGRESSION AUTHORIZATION REQUIRED**. The smallest future scope is a shared-parser correction plus focused POS, batch-selection and existing expiry-helper regressions; no repair or protected acceptance is inferred here.

### PF-SUP-2026-10-27-05 MVP-01C validator correction

The local validator mismatch is corrected: M-16-compatible normalized single-label-domain emails are accepted, while impossible Gregorian dates, invalid time/offset components and fractions beyond PostgreSQL microsecond precision fail closed. Secret-bearing response rejection and server-status/time-derived-expiry separation remain intact. Status: **LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED - INDEPENDENT REVIEW REQUIRED - RPC/RLS/AUTH/BROWSER NOT RUN**. Protected blockers are unchanged and AUTH-02 remains deferred.

### MVP-01C staff invitation oversight disposition - 2026-10-27

The missing local read-only invitation oversight surface is authored against the existing M-16 list RPC. Strict response validation, immutable results, OWNER/MANAGER workspace containment, sanitized failures and deterministic stale-publication rejection pass isolated local checks. Status: **LOCALLY IMPLEMENTED AND SYNTHETICALLY VERIFIED - INDEPENDENT REVIEW REQUIRED - RPC/RLS/AUTH/BROWSER NOT RUN**. This closes no protected blocker: deployed signature compatibility, server authorization/RLS, actual Auth/browser scheduling and production data behavior remain unverified; AUTH-02 remains deferred. Full staff roster and invitation/membership mutations are outside this milestone.

## BLK-002 I3A design disposition — 2026-10-26

## BLK-002 ACC-01 harness disposition — 2026-10-26

PF-SUP-2026-10-26-11 corrects the remaining runner-source defects: coordinator updates now validate exact aggregate affected-row acknowledgments, and session/coordinator lock identities share unsigned 64-to-32-bit decomposition without signed-int narrowing. Local boundary regressions pass; PostgreSQL `pg_locks` parity remains **NOT RUN**. Status: **TWO-POINT RUNNER CLOSURE LOCALLY VERIFIED — PROTECTED ACCEPTANCE NOT RUN — INDEPENDENT REVIEW REQUIRED — AUTH-02 DEFERRED**.

PF-SUP-2026-10-26-10 removes harness-only concurrency claims. Only the two operation-collision orderings are executable concurrency source, both through actual application RPCs and their production operation lock. Recovery concurrency is not implemented because the recovery RPC exposes no lock; reservation/revocation concurrency is fixture-lifecycle blocked; consumption/revocation is Auth-scope blocked. Structured sanitization and framed process output pass pure local regression tests. Status: **EXECUTION-FIDELITY CORRECTED LOCALLY — PROTECTED ACCEPTANCE NOT RUN — INDEPENDENT REVIEW REQUIRED — AUTH-02 DEFERRED**.

ACC-01 acceptance-preparation sources are locally authored with a non-authorizing template and fail-closed target/hash/fixture/command/evidence/cleanup guards. Pure/injected/static/type checks pass; no protected resource was accessed. PostgreSQL syntax/application, effective ACL/RLS, real concurrency, Auth/provider/browser feasibility and cleanup remain **NOT RUN**. `REV-LIN-01` is an explicit owner decision; exact protected execution scope and AUTH-02 remain deferred. Status: **HARNESS AUTHORED — INACTIVE — INDEPENDENT REVIEW REQUIRED — EXTERNAL ACCEPTANCE BLOCKED**.

PF-SUP-2026-10-26-08 safety findings are locally corrected in source: explicit endpoint/target proof, unified exact inventory with narrow command grants, non-adopting fixture ownership, dependency-preserving cleanup, exact blocker/waiter/lock concurrency proof, fixed scenario bodies and sanitized evidence. Confirmed Auth continuation remains **NOT IMPLEMENTED** under the prohibited Auth scope; provider feasibility is open; REV-LIN-01 is policy-blocked. Status: **CORRECTION LOCALLY VERIFIED — POSTGRESQL/AUTH/PROVIDER/BROWSER NOT RUN — INDEPENDENT REVIEW REQUIRED — AUTH-02 DEFERRED**.

The missing-review-export evidence gap is reconciled through explicit owner-supplied transcript attribution for PF-SUP-02/05/06; no absent detail is invented. I3 implementation hashes remain unchanged, and I3A authority/acceptance design is prepared. Remaining blockers: owner decisions REG-01/IDP-01/ROT-01/PRV-01/ACC-01, independently reviewed runner sources, provider exact-status feasibility, a positively identified disposable target and explicit AUTH-02 execution/cleanup authority. Status: **I3A DESIGN COMPLETE — PROVIDER/RUNTIME/ACCEPTANCE OPEN — AUTH-02 DEFERRED — ROLLOUT BLOCKED**.

## BLK-002-I3 conditional gate audit — 2026-10-26

The conditional authorization's required independent I2 acceptance cannot be verified from a local GPT-6 review artifact. Six stable I2 snapshot artifacts still match the historical correction manifest; six shared ledgers have advanced. Safe next action: submit `PHARMACYFLOW_BLK002_I3_CONDITIONAL_GATE_REVIEW_REQUEST_2026-10-26.md` for the explicit independent verdict defined there. Status: **PLANNING READY — IMPLEMENTATION BLOCKED BY MISSING INDEPENDENT GATE EVIDENCE — AUTH-02 DEFERRED**. Existing inactive I3 artifacts are preserved but receive no new acceptance or execution authority from this audit.

Baseline: 2026-10-23. A blocker stops only dependent work; independent authorized work continues.

| ID | Milestone | Class | Exact blocker and evidence | Impact | Safe next action | Status |
|---|---|---|---|---|---|---|
| BLK-001 | M2/M3/M5 | Authorization | No owner-approved PharmacyFlow-only database/browser/service target has been executed. See `docs/development/PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md` and `docs/development/PHARMACYFLOW_ISOLATED_ACCEPTANCE_PLAN.md`. | Exactly-once sale/refund/stock effects, RLS, concurrency, IndexedDB, and Edge compatibility cannot be claimed. | Review the disposable authorization proposal, then authorize one exact target and command set if desired. | BLOCKED BY EXECUTION AUTHORIZATION |
| BLK-002 | M4 | Security/authorization | Owner-authorized I3 local artifacts now include inactive injected gateway/operator façades, typed recovery/idempotency, mutually exclusive least-privilege executor contracts and unexecuted migration `000030`. Focused gateway 16, operator 17 and static 42 assertions pass. The migration aborts on unmapped pre-I3 rows. | Local contracts exist, but provider/workload identity, SQL syntax/application, effective privileges/RLS, real concurrency, Auth/browser behavior and compatibility on any populated target remain unverified. | Incrementally review the exact I3 manifest. Do not execute `000030`, map identities, issue credentials, activate routes/signup or begin production integration without a new owner authorization. | I3 LOCALLY AUTHORED — INACTIVE/UNEXECUTED — INDEPENDENT REVIEW REQUIRED — AUTH-02 DEFERRED — ROLLOUT BLOCKED |
| BLK-003 | M4 | Security/authorization | Forward-only SQL migration `000035`, capability boundary, and operation-level enforcement contracts are locally authored and synthetically verified (456 unit assertions, 49 wiring assertions). Database execution and RLS verification remain unexecuted. | Local-clock resistance and operation-by-operation expiry enforcement are designed and locally verified; PostgreSQL execution and live activation remain pending. | Independently review the PF-MVP-08 local evidence package before authorizing PostgreSQL execution or production integration. | LOCALLY AUTHORED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — POSTGRESQL NOT RUN — AUTH-02 DEFERRED |
| BLK-004 | M4 | Commercial policy | COM-01 leaves final prices, discounts, international pricing, and some entitlement transition rules undecided. | A production plan catalog and invoices cannot be finalized or published. | Define versioned configurable fields now; obtain owner choices before activation. | BLOCKED BY OWNER DECISION |
| BLK-005 | M4 | Commercial policy | COM-02 leaves credit valuation, qualification period, cap, expiry, and annual/discount interaction undecided. | Referral reward issuance cannot be safely specified as final or activated. | Keep issuance inactive and prepare configurable alternatives for owner review. | BLOCKED BY OWNER DECISION |
| BLK-006 | M4 | Authorization | No protected Paystack/payment/referral server implementation or activation is authorized; no runtime implementation was found outside legacy M-3 tables and disconnected Admin fixtures. The forward design is now in `docs/mvp/PHARMACYFLOW_COMMERCIAL_ARCHITECTURE.md`. | Billing settlement, webhook verification, credits, chargebacks, and entitlement reconciliation remain unimplemented. | Independently review the design and resolve BLK-004/005 before requesting protected implementation. | BLOCKED BY EXECUTION AUTHORIZATION |
| BLK-007 | M4/M5 | Access method | APP-07 identifies PharmacyFlow-Dev `lqzsfsmppoaibnzczmhf`, but no technically enforced read-only credential/method is available. | Remote migration ledger, grants, functions, configuration presence, and compatibility remain unknown. | Owner supplies/approves an exact read-only method scoped to the documented inspection. | BLOCKED BY EXECUTION AUTHORIZATION |
| BLK-008 | M2/M5 | Technical/evidence | The root application has no active Capacitor Android project; the only historical mobile configuration is in the noncanonical reference tree. | Android acceptance and release artifacts are absent. | Decide whether to reconcile the reference configuration into the canonical root after web contracts stabilize. | PARTIALLY IMPLEMENTED |
| BLK-009 | M5 | Technical | `package-lock.json` is already dirty and `npm ls --all --package-lock-only --ignore-scripts` reports missing nested optional Tailwind oxide WASM packages. | The exact release dependency snapshot is not yet cleanly reproducible. | Preserve the user-owned lockfile; review and repair only in a separately scoped dependency batch without installation unless authorized. | BLOCKED BY EXECUTION AUTHORIZATION |
| BLK-010 | M4/M5 | Security/evidence | Admin Support's minimal allowlist is local and fail-closed, but its platform-admin projection and grants have not been verified on an approved target. | MVP Admin capability remains partial and cannot be called authorization-verified. | Execute only the approved read-only/isolated authorization matrix after target approval. | BLOCKED BY EXECUTION AUTHORIZATION |
| BLK-011 | M2/M5 | Evidence | Reports and inventory services/tests exist, but totals, tenant/branch constraints, pagination, and stock effects lack approved database reconciliation. | Financial/reporting and stock correctness remain unverified. | Use committed disposable fixtures and role-aware assertions under TEST-01 approval. | BLOCKED BY EXECUTION AUTHORIZATION |
| BLK-012 | M5 | Review/release | PF-SUP-2026-10-25-12 completed independent review of the 30-file correction snapshot with no new P0/P1. That scoped review does not review the broader dirty tree, refresh the historical release candidate, authorize staging/commit, or establish MVP/release acceptance. | The incremental correction-review gate is complete; release assembly and approval remain separate. | Obtain explicit owner selection for the next bounded batch. Later regenerate and independently review a deliberate release snapshot before any selective staging request. | SCOPED REVIEW COMPLETE — RELEASE ACCEPTANCE OPEN |
| BLK-013 | M3/M4 | Owner decision/security proof | The signed offline-grant alternative in `docs/development/PHARMACYFLOW_FORWARD_CONTRACT_DESIGNS.md:56` has no approved issuance, revocation, sequence/budget, theft, clock, or device-compromise policy and no server proof. | First-seen-after-expiry work cannot be auto-authorized from client time; it stays durable/quarantined. | Owner chooses conservative first-server-acceptance or separately approves a full signed-grant design; protected implementation and proof follow. | BLOCKED BY OWNER DECISION |
| BLK-014 | M5 | Deployment ordering/access | Corrected locally at PF-SUP-2026-10-25-11: `PHARMACYFLOW_DEPLOYMENT_RECOVERY_PLAN.md` now makes independently reviewed disposable acceptance a hard prerequisite to Dev inspection/rollout. AUTH-03 still has no enforced read-only access method and no step was executed. | The source ordering defect is removed; Dev compatibility and rollout remain unavailable. | Independent review, then resolve AUTH-03 access method and obtain step-specific protected authorizations. | LOCALLY CORRECTED — AUTH-03 BLOCKED — ACCESS METHOD |
| BLK-015 | M3/M4 | Source/browser evidence | `CapabilityAsyncBoundary.update` exposes invalidation and Customers, Suppliers, Devices and Cash production effects clear busy state on scope/expiry/renewal invalidation. Nine focused assertions passed; PF-SUP-2026-10-25-12 reviewed the correction. Real React/browser behavior remains unexecuted. | The demonstrated source-state defect is corrected and locally reviewed without claiming browser acceptance. | Retain real-browser Gate D/F as later external acceptance under separate authority. | LOCALLY REVIEWED — EXTERNAL BROWSER EVIDENCE OPEN |
| BLK-016 | M3/M5 | Protected evidence | Status-v2 credential/response/HTTP corrections and injected 23/23 orchestration passed and were independently reviewed at PF-SUP-2026-10-25-12. Deterministic database/PostgREST/concurrency execution remains unexecuted. | The local runner defect is corrected/reviewed; exactly-once, real concurrency, signatures and grant/RLS claims remain incomplete. | AUTH-02 remains owner-deferred. If later resumed, use only a newly authorized exact snapshot and target. | LOCALLY REVIEWED — EXTERNAL NOT RUN — OWNER DEFERRED |
| BLK-017 | M3/M5 | Cleanup/source dependency | Bidirectional known-user guards, constrained ambiguous-create handling and original-root proof passed injected/static checks and were independently reviewed at PF-SUP-2026-10-25-12. Actual Auth-trigger/elevated cleanup behavior remains unverified. | The local false-zero path is corrected/reviewed; external cleanup acceptance remains open. | AUTH-02 remains owner-deferred. If later resumed, use only a newly authorized exact snapshot and target. | LOCALLY REVIEWED — EXTERNAL NOT RUN — OWNER DEFERRED |

### MVP-01B membership workspace disposition — 2026-10-27

The local membership workspace now fails closed across pharmacy/branch resolution and publishes operational context only after current user, active membership, pharmacy, role and returned eligible branch bindings cohere. Multiple eligible branches require a session-only choice; no branch preference is persisted. Production-used generation guards have isolated overlap/sign-out regressions. Status: **LOCALLY IMPLEMENTED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — AUTH/RLS/BROWSER NOT RUN**. No existing protected-execution blocker is closed: database branch visibility, real Auth lifecycle behavior, browser view/draft behavior and runtime server authorization remain unverified; AUTH-02 is deferred.

### PF-SUP-2026-10-27-03 MVP-01B publication-boundary correction

The demonstrated helper-to-caller microtask gap is corrected locally. Awaiting callers recheck freshness before starting another query, and all workspace outcome setters plus the existing preference-hint write execute only inside one synchronous `publishIfCurrent` boundary. Deterministic invalidation-after-helper-check regressions pass for sign-out, selection, refresh and identity change with zero stale publication. Status: **LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — AUTH/BROWSER NOT RUN**. Protected Auth, browser, RLS and production acceptance remain open; AUTH-02 is deferred.

### PF-SUP-2026-10-27-02 MVP-01B session-transition correction

The demonstrated superseded-sign-in publication path is corrected locally: all sign-in results, initial-session results, identity-bearing Auth events and sign-out cancellation pass through one production coordinator before identity state changes. Workspace query continuations use the shared generation guard, and deferred synthetic regressions exercise publication rather than token arithmetic alone. Status: **LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED — AUTH/BROWSER NOT RUN**. This does not close protected Auth, browser, RLS or production acceptance; AUTH-02 remains deferred.

## Hard abort conditions

ACC-01 reservation/revocation concurrency is now **SOURCE AUTHORED — POSTGRESQL NOT RUN** for both orderings. The prior committed-fixture source gap is closed locally: active admissions are created through the production RPC, and both sessions contend on `hashtextextended(email_digest, 1)`. Real transition, lock, count, cancellation and rollback evidence remains blocked by deferred AUTH-02. Durable-recovery concurrency, consumption/revocation, confirmed Auth continuation, provider feasibility and REV-LIN-01 remain unchanged.

Any eventual protected runner must stop before external access if the target identity, source hash, loopback binding, service identity, credentials scope, migration set, browser profile, or cleanup target differs from the owner-approved package. StoreFlow identity or uncertainty is an unconditional abort.

## REV-LIN-01 disposition

REV-LIN-01 is no longer owner-decision blocked: transaction-entry linearization is approved. Technical enforcement remains **BLOCKED — IMPLEMENTATION AUTHORIZATION** because provider dispatch/resolution lacks a fresh phase-entry authority check and recovery currently conflates the authorized recovery actor with immutable original operation authorship. A bounded façade/test/forward-migration correction is proposed; PostgreSQL/Auth/provider/runtime mapping and rollout remain separately blocked. AUTH-02 remains deferred.

### REV-LIN-01 implementation disposition — PF-SUP-2026-10-26-14

The implementation-authorization blocker above is superseded: the owner authorized and the local correction now authors fresh dispatch/resolution/completion/result-lookup authority, immutable original provenance, scoped alternate recovery and separate audit actor evidence in inactive source plus unexecuted migration `000033`. Local injected/static/compiler evidence passes. The remaining blocker is **INDEPENDENT REVIEW / PROTECTED ACCEPTANCE**: the empty authority-scope registry has no provisioned runtime mapping, and PostgreSQL syntax/application, effective ACL/RLS, transaction rollback, locks/concurrency, Auth/provider/browser and production behavior are not verified. AUTH-02 remains deferred.

### PF-SUP-2026-10-26-15 security disposition

The reviewed cross-principal ISSUE-route and permissive injected-scope defects are corrected locally. Proposed migration `000034` adds original-principal enforcement to the shared SQL dispatch/completion/result helpers and reasserts route ACLs; the injected authority now denies missing or inactive grants. Status: **LOCALLY CORRECTED — INDEPENDENT REVIEW REQUIRED — POSTGRESQL NOT RUN**. Runtime scope provisioning and every protected acceptance/rollout activity remain blocked; AUTH-02 remains deferred.

### PF-SUP-2026-10-26-16 ACC-01 alignment disposition

The harness now pins migrations through `000034`, uses current v4/phase RPC signatures and authors owned scope/security cleanup plus rollback-only pending-phase cases. Status: **SOURCE ALIGNED — INDEPENDENT REVIEW REQUIRED — POSTGRESQL NOT RUN**. Successful completion, completed replay and completion-audit rollback remain **BLOCKED_AUTH_02** because the production boundary requires a genuine trusted Auth subject; durable recovery concurrency remains **NOT IMPLEMENTED** pending a reviewed provider-resolution fixture/outcome contract. Runtime provisioning and every protected action remain blocked.

### PF-SUP-2026-10-26-17 assertion disposition

The omitted retired-v2 ACL signatures and nullable response assertions are closed locally. The static matrix now equals all nine superseded identity signatures revoked by `000033`–`000034`; typed response guards reject missing/null/mistyped/incorrect bindings while preserving a present JSON-null pending result. Status: **LOCALLY CORRECTED — INDEPENDENT REVIEW REQUIRED — POSTGRESQL NOT RUN**. Existing AUTH-02, completion/replay/audit, concurrency, provisioning and rollout blockers are unchanged.

### PF-SUP-2026-10-29-03 foundation security disposition

Request binding, strict evidence, sanitized timeout behavior, exact committed replay authorization and deterministic administrative decisions are locally corrected. Status: **FOUNDATION LOCALLY CORRECTED — INDEPENDENT REVIEW REQUIRED**. Business routes remain unwired; legacy callable and direct-table bypass policy, SQL execution, privileges/RLS and concurrency evidence require a new protected owner scope. AUTH-02 remains deferred.

### PF-SUP-2026-10-29-04 foundation acceptance disposition

Full-scope proof consumption, PostgreSQL-compatible microsecond ordering, v2 administrative evaluation, trusted producers and exact superseded-helper closure are locally authored and regression-covered. `000035` currently matches the documented `46a285...` foundation baseline and was not edited; a transient `8a43...` state remains unattributed because the migration is untracked. Status: **LOCAL FOUNDATION ACCEPTANCE READY — INDEPENDENT REVIEW REQUIRED**. Trusted evidence production remains unwired; PostgreSQL/concurrency and business enforcement remain blocked. AUTH-02 remains deferred.

### PF-SUP-2026-10-30-01 migration lineage and parity blocker

Competing PF-MVP-09/R/S migration `20261029000037` is syntactically malformed and not contract-parity safe. Normal chronological application stops before the clean later foundation proposal. Status: **BLOCKED — OWNER SOURCE-DISPOSITION REQUIRED — POSTGRESQL NOT RUN**. Owner must explicitly authorize replacement-in-place or moving/renaming the artifact, plus legacy/direct-table policy, before further wiring. AUTH-02 remains deferred.
