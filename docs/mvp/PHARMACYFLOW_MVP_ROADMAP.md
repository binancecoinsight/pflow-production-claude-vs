# PharmacyFlow MVP and protected-acceptance roadmap

## PF-MVP-10 native-client conformance and final execution gate - 2026-10-31

Native-client prefixes and migration notice forms are now locally aligned with strict consumer behavior, including source-faithful normal-dispatch and coordinator transcripts. Independent review is next. Actual PostgreSQL acceptance still requires separately authorized disposable execution.

## PF-MVP-10 emitter/consumer conformance closure - 2026-10-31

The package now has exact SQL emitter/consumer conformance, a shared runtime frame and an injected rehearsal of the actual concurrency coordinator. Representative transcripts are derived from the delivered SQL but remain local source evidence. Independent review precedes protected PostgreSQL acceptance.

## PF-MVP-10 whole-command acceptance closure - 2026-10-31

The executable package now uses one fresh 61-entry inventory rather than a historical review manifest. Every documented command is locally rehearsed through actual preflight and dispatch with protected process calls replaced in memory. Independent review precedes any exact disposable-target execution authorization; cleanup deletion, environment destruction, AUTH-02 and direct-table policy remain separate.

## PF-MVP-10 production-path integration closure - 2026-10-31

PF-SUP-2026-10-30-06 supersedes the runner-safety readiness claim. The default production bridge, complete worker transcript, sealed M-13 conflict behavior, Refund V2 nonce/provenance cases and immutable-evidence cleanup refusal are locally corrected and injected-rehearsed. Nothing protected was executed. Independent review precedes any exact target authorization; fixture deletion, environment destruction, AUTH-02 and direct-table enforcement remain separate gates.

## PF-MVP-10 runner safety/evidence closure - 2026-10-30

The prior runnable-package claim is superseded by PF-SUP-2026-10-30-05. Command permissions, target/state/ownership proof, executable role/RLS and business assertions, deterministic concurrency, PowerShell compatibility and sanitized bounded evidence are locally corrected. Nothing protected was executed. Independent review precedes any exact target authorization; AUTH-02 and direct-table enforcement remain separate.

## PF-MVP-10 executable acceptance-package readiness - 2026-10-30

The stale five-milestone summary is superseded. PF-MVP-10 now has a complete target-neutral runnable package through migration 000039, but nothing has been executed. Independent review and a separately supplied disposable target/identity, credentials mechanism, command/scenario permissions, cleanup decision and optional destruction adapter/authority are required. AUTH-02 and direct-table enforcement remain separate.

## Entitlement migration lineage repair and canonical contract parity - 2026-10-30

The malformed version-37 proposal is preserved outside the active migration namespace at SHA-256 `279376c9a1d94205e62ceba49d349b76c9c69c21f1ec6c2cf1dde5e393de7ce6`. The canonical active chain ends at additive, unexecuted `20261030000038_canonical_entitlement_contract_parity_v1.sql`, which guards and delegates to the latest sealed financial, inventory, transfer and staff contracts. Source/synthetic evidence is complete. PostgreSQL parsing/application, database/RLS/concurrency, live RPC/Auth/provider and deployment require later authorization. AUTH-02 remains deferred.

## PF-MVP-09S-FINAL Consolidated Privileged-Caller Security Closure and Disposable-Test Readiness - 2026-10-30

The owner-authorized PF-MVP-09S-FINAL milestone establishes definitive operator provenance across all privileged operational RPCs (`rpc_ingest_sale_stock_movement`, `rpc_commit_sale_v1`, `rpc_process_sale_return_v2`), eliminating reliance on mere `service_role` role identity or ambient member existence. Initiating operator identity is verified via `auth.uid()` or JWT sub claim (`request.jwt.claim.sub`) or explicit `p_actor_user_id` parameter, checking active pharmacy membership and specific permissions (`sales.create` / `sales.refund`). Replay authorization strictly validates 64-char hex SHA-256 payload hashes against domain idempotency records (`client_op_id`, `dispatch_client_op_id`, `receive_client_op_id`), failing closed on missing/malformed hashes and raising `23505 IDEMPOTENCY_VIOLATION` on mismatch. 1,343 passing assertions across entitlement suites; 43/43 suites passing in `scripts/run-tests.ts`. Next gate: independent GPT-6 acceptance review. Remote database execution, Docker, Auth/provider integration, and production activation remain unexecuted; AUTH-02 is deferred.

## PF-SUP-2026-10-30-01 entitlement wiring parity correction

PF-MVP-09/R/S closure and disposable-readiness claims are superseded. The competing migration is malformed and materially diverges from sealed M-18, Refund V2, inventory and transfer contracts. The authoritative runnable lineage stops at `000036`; independent source review and an explicit owner migration-disposition choice are required before any new wiring or execution milestone.

## PF-MVP-09S Final Entitlement Security Contract Closure and Disposable-Test Readiness - 2026-10-30 — SUPERSEDED

The owner-authorized PF-MVP-09S milestone resolves all remaining entitlement security findings: trusted operator provenance is enforced for backend Edge Function calls (`service_role`) without blanket bypass by verifying target pharmacy existence and active operator membership (including `request.jwt.claim.sub` operator validation). Replay authorization bypasses are eliminated: replay strictly requires a valid 64-character hex SHA-256 payload hash, strictly checks domain idempotency keys (`client_op_id`, `dispatch_client_op_id`, `receive_client_op_id`), removes unverified primary-key matching (`OR id = p_operation_id`) and table fallbacks, and raises `23505 IDEMPOTENCY_VIOLATION` on hash mismatch. Operational RPC security boundaries and least-privilege grants are preserved: private mutations (`rpc_ingest_sale_stock_movement`, `rpc_commit_sale_v1`, `rpc_process_sale_return_v2`) require `TRUSTED_GATEWAY_REQUIRED` and are revoked from authenticated client access. Administrative suspension ordering evaluates effective dates and sequence numbers, honoring explicit reinstatements. 1,238 assertions passed across static and synthetic suites (0 failures). Next gate: independent GPT-6 acceptance review. Remote database execution, Docker, Auth/provider integration, and production activation remain unexecuted; AUTH-02 is deferred.

## PF-MVP-09R Consolidated Entitlement Enforcement Acceptance Hardening - 2026-10-30

The owner-authorized PF-MVP-09R milestone completes acceptance hardening for server-authoritative entitlement enforcement across all eight operational SECURITY DEFINER RPCs (`rpc_ingest_sale_stock_movement`, `rpc_commit_sale_v1`, `rpc_process_sale_return`, `rpc_process_sale_return_v2`, `rpc_receive_inventory_stock`, `rpc_adjust_inventory_stock`, `rpc_dispatch_stock_transfer`, `rpc_receive_stock_transfer`, and staff management RPCs). Migration version collision is resolved by preserving `20261029000036_entitlement_foundation_security_closure_v1.sql` and advancing the unexecuted forward migration to `20261029000037_consolidated_entitlement_enforcement_v1.sql` (Version 37). Trusted backend caller identity handling is hardened to accept `service_role` (for Edge Functions `sync-push-sale`, `sync-push-return`, `sync-push-return-v2`) and active authenticated members, failing closed with SQLSTATE `28000` for unauthenticated non-service callers. Replay hardening binds idempotent offline recovery strictly to matching operation kinds, domain tables, caller pharmacy identity, and payload fingerprints (`23505 IDEMPOTENCY_VIOLATION` on mismatch), while preventing cross-operation replay forgery. Online staff management operations cannot be replayed offline. Administrative suspension ordering properly accounts for subsequent reinstatements, and all 8 historical read and recovery operations remain unconditionally authorized across all states. Next gate: independent GPT-6 acceptance review. Remote database execution, Docker, Auth/provider integration, and production activation remain unexecuted; AUTH-02 is deferred.

## PF-MVP-08 / BLK-003 Server-Authoritative Entitlement Foundation - 2026-10-29

The M4 entitlement foundation is locally authored and synthetically verified. Forward-only SQL migration `20261029000035_server_authoritative_entitlement_v1.sql` provides PostgreSQL UTC clock authority, the immutable `pharmacy_entitlement_anchors` audit ledger, `rpc_get_effective_entitlement_v1`, and `assert_pharmacy_mutation_entitled_v1`. Client capability boundaries and enforcement classify protected mutations and fail closed on expired/unknown states while unconditionally preserving historical audit reads and legitimate previously accepted offline replays. Next gate: independent GPT-6 source/synthetic security review. Remote database execution, Auth/provider integration, and activation remain unexecuted; AUTH-02 is deferred.

## PF-SUP-2026-10-29-02 MVP-02-CLOSE correction

The M2 inventory slice has completed its corrected local source/synthetic/fake-IndexedDB acceptance package. Independent review and protected browser/database evidence are next; no further local inventory substitute is scheduled. Entitlement foundation milestone PF-MVP-08 was subsequently authorized and completed, resolving the seven security and contract findings.

## MVP-02-CLOSE local inventory acceptance - 2026-10-29

The inventory slice of M2 is locally accepted for inspected source, injected client behavior, in-memory helpers and isolated fake IndexedDB. Catalog/snapshot, intake, adjustment, transfer, refresh, attention, detail and POS non-interference are integrated. Its remaining gates are real browser/datastore and database/RLS/RPC/ledger/production acceptance under deferred AUTH-02; no further local substitute is scheduled.

## PF-SUP-2026-10-28-04 MVP-02B rendering-boundary correction - 2026-10-29

The production ProductList now fails closed at its runtime presentation boundary without changing the shared stock derivation. Malformed catalog evidence is unavailable rather than empty, while valid products with absent or malformed stock evidence remain visible as unknown outside numeric filters. Focused in-memory rendering, static and compiler evidence passes. Independent review is next; actual browser/datastore, RLS/database, authoritative-stock and production evidence remains open under deferred AUTH-02.

## MVP-02B branch-scoped cached stock attention - 2026-10-28

One shared local derivation now drives both branch stock attention and ProductList stock presentation from already-loaded cache evidence. It fails closed for missing/malformed/duplicate/cross-boundary/unsafe evidence, keeps unknown products visible, and prevents numeric filters from treating unknown as zero or adequate. Coverage and labels remain explicitly cached/projected and non-authoritative. This advances the local M2 low-stock UX gap only; browser/IndexedDB, RLS/database, authoritative stock and production acceptance remain unverified under deferred AUTH-02.

## PF-SUP-2026-10-27-07 MVP-02A robustness correction

The completed-read-error presentation and runtime collection/row validation defects are corrected locally with production-used pure logic and in-memory panel rendering. Normal cache coverage semantics and all query paths remain unchanged. Stop for independent review; browser/IndexedDB/RLS/database/production evidence remains open, the shared parser defect is not repaired, and AUTH-02 remains deferred.

## MVP-02A branch-scoped inventory expiry attention - 2026-10-27

Branch-scoped expiry attention is locally authored against existing cached products, batches and freshness metadata only. Results are labelled cached/projected, preserve server status, use strict UTC calendar derivation and fail closed to partial/unknown when coverage cannot be established. This is source/synthetic evidence, not browser, IndexedDB, RLS, database, authoritative-stock or production acceptance. Independent review is next. The shared POS/batch-selection date parser remains a separately recorded defect; low-stock work is excluded and AUTH-02 remains deferred.

## MVP-01C read-only staff invitation oversight - 2026-10-27

The existing M-16 invitation-list contract now has a locally authored, fail-closed client path for coherent active OWNER/MANAGER workspaces. The entire ten-field response is validated before immutable publication; server status is preserved and any past-expiry hint is explicitly clock-derived. This is local source/synthetic evidence only. Independent review is next; real RPC/RLS/Auth/browser acceptance and broader staff administration remain separate protected milestones under deferred AUTH-02.

## I3A design and evidence-reconciliation gate — 2026-10-26

The owner-supplied PF-SUP-02/05/06 transcript dispositions reconcile the prior missing-export gate without erasing the earlier assessment. I3A design now specifies authority governance, identity mapping and unexecuted disposable acceptance matrices. Next: independent review, then discrete owner decisions for registry governance/provider feasibility and local harness authoring; actual target/services/credentials/migrations/fixtures/Auth/provider/browser/concurrency/cleanup require a later exact AUTH-02 authorization. No runtime implementation or MVP/production readiness is claimed.

## BLK-002-I3 conditional planning gate — 2026-10-26

Under the attached conditional authorization, the locally missing detailed independent I2 verdict blocks new I3 implementation. The current permitted deliverable is the exact independent-review request and planning manifest only. Existing inactive I3 source/migrations from later separately recorded milestones remain historical dirty-tree artifacts awaiting their own review and do not satisfy this gate by existence. Next action: obtain the explicit I2 verdict requested in `PHARMACYFLOW_BLK002_I3_CONDITIONAL_GATE_REVIEW_REQUEST_2026-10-26.md`; do not proceed to I3/I3A, SQL execution, provisioning, integration, activation or deployment. AUTH-02 remains deferred and MVP/production readiness remains blocked.

## BLK-002-I3 local authoring gate — 2026-10-26

I3 inactive façade and forward-contract authoring is complete locally. Migration `000030` and all proposed roles/grants are unexecuted; no identity is mapped and no route is active. Next action is incremental independent review only. M4/M5/MVP and deployment remain blocked on later explicit provider, access-method, database/RLS/concurrency, Auth and browser authorization/evidence. AUTH-02 remains deferred.

## BLK-002-I2 conditional design gate — 2026-10-26

The owner-approved local I2 design is complete and conditionally feasible. The recommended boundary uses a dedicated revocable workload principal, a narrow gateway façade, a separate operator permission plane and applicant-authenticated recovery/consumption. ADM-01 and REV-01 are policy-complete but not implemented. The next proposed milestone is BLK-002-I3 local protected authoring after independent review and explicit owner approval. M4, M5, MVP and deployment remain blocked; real provider, PostgreSQL/RLS/concurrency, Auth and browser acceptance are not verified.

## PF-SUP-2026-10-25-12 reviewed dependency-order update

The 30-file correction snapshot completed scoped independent review with no new P0/P1. BLK-015–017 are locally reviewed, while external acceptance remains **NOT RUN — OWNER DEFERRED** under AUTH-02. This closes BLK-012's incremental correction-review step only; it is not release, MVP, execution, staging or deployment acceptance. AUTH-03 remains **BLOCKED — ACCESS METHOD**. The next local milestone requires an explicit owner selection from the decision packet; the smallest recommendation is BLK-002 onboarding contract v1 local authoring and synthetic tests only.

Baseline: 2026-10-23, `main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`. The roadmap is incremental over the existing development records; it does not reopen completed local Phase B/Refund V2 work without a demonstrated defect.

PF-SUP-2026-10-23-08 reconciliation: M1 inventory completion is documentation/static reconciliation only, not application implementation or acceptance. This five-milestone view overlays—rather than replaces—the existing MVP-01..09 / PROD / REL roadmap in `docs/development/PHARMACYFLOW_ROADMAP.md`.

## Mapping to the existing development roadmap

| Five-milestone stream | Existing roadmap work | Relationship after -08 |
|---|---|---|
| M1 baseline | All MVP-01..09 plus PROD/REL inventory | Inventory/status reconciliation complete locally; underlying implementation/evidence statuses remain unchanged. |
| M2 core SaaS | MVP-01, MVP-02, MVP-03, MVP-05, MVP-06 | Continue only demonstrated local gaps; protected DB/financial acceptance remains blocked. |
| M3 offline/integrity | MVP-03, MVP-04, MVP-05; PROD-02/03 | Preserve reviewed Phase B/Refund V2 source. Real browser, PostgREST, SQL and concurrency evidence remains AUTH-02 deferred. |
| M4 admin/commercial | MVP-01, MVP-07, MVP-08 | Client/Admin containment and forward designs are local; protected onboarding, entitlement, billing and referral authority is not implemented. |
| M5 acceptance/release | MVP-09; PROD-01..07; REL-01..04 | Reuse existing acceptance/release artifacts. No deployment, Git, environment or acceptance execution is implied. |

## Dependency graph

`M1 baseline` -> `M2 core workflows` -> `M3 transactional acceptance` -> `M5 integrated acceptance`

`M1 baseline` -> `M4 onboarding/entitlements/commercial designs` -> `M5 integrated acceptance`

M2 and M4 can progress independently where they do not alter protected contracts. M3 external verification depends on TEST-01 authorization. Commercial activation and release remain separate final gates.

## M1 — Baseline audit and architecture reconciliation

**Status:** COMPLETE (local static evidence; independent review pending)

- Reconciled canonical root SaaS, separate Admin app, database/Edge/offline layers, test evidence, commercial gaps, protected contracts, and current blockers.
- Created the six persistent `docs/mvp` registers and reused prior checkpoint evidence instead of rerunning a broad audit.
- No production source, sealed migration, service, environment, or Git state was changed.
- PF-SUP-2026-10-23-07/-08 unresolved findings are carried as BLK-013 through BLK-017. PF-SUP-2026-10-25-09 corrects BLK-017's local Edge cleanup source dependency only; inventory completion still does not close offline-grant proof, deployment ordering, busy-state browser proof, deterministic concurrency execution, or external cleanup evidence.

**Exit evidence:** `PHARMACYFLOW_CAPABILITY_MATRIX.md`, `PHARMACYFLOW_BLOCKER_REGISTER.md`, `PHARMACYFLOW_OWNER_APPROVALS.md`, `PHARMACYFLOW_TEST_EVIDENCE.md`, and `PHARMACYFLOW_MILESTONE_REPORT.md`.

## M2 — Core Pharmacy SaaS completion

**Status:** PARTIAL

1. Treat current catalog, batches, intake, adjustment, transfer, supplier, customer, POS, sales, refunds, cash, and reporting implementations as implemented-but-unverified.
2. Perform a focused source/test gap pass only where the capability matrix identifies a local, nonprotected gap.
3. Preserve capability-level APP-02 containment and durable checkout recovery semantics.
4. Defer database/RLS/stock/financial acceptance to the exact disposable target approval.

**Exit gate:** every core workflow has adequate permitted evidence or an exact blocker; database-dependent correctness is not relabeled verified.

## M3 — Offline synchronization and transactional integrity

**Status:** PARTIAL / BLOCKED BY EXECUTION AUTHORIZATION

1. Preserve the independently reviewed C-01–C-03 corrections and synthetically reviewed C-04 adapters.
2. Preserve sealed M-18 and Refund V2 migrations/contracts; execute no SQL without approval.
3. Under later authorization, run identity-guarded Gate A/B suites for status-v2 authorization, M-18 replay/conflict/rollback/concurrency, Refund V2 compatibility, browser IndexedDB contention/restart, and consecutive checkout/receipt transitions.
4. Collect exact effects, rollback, backend overlap, and cleanup evidence; sequential execution never qualifies as concurrency.
5. Keep signed offline grants unimplemented unless the owner selects that policy and approves issuance/revocation/budget/device proof. First-server-acceptance remains conservative.
6. Treat POS busy-state recovery as locally implemented/synthetically covered but real-browser unverified. Treat current SQL role simulation as administrative characterization, not PostgREST grant/RLS acceptance.

**Exit gate:** critical database, Edge, real-browser, and independent security/financial evidence is complete. Until then M3 remains partial.

## M4 — Admin, onboarding, subscriptions, billing, and referrals

**Status:** PARTIAL

1. Keep Admin Support minimal, read-only, allowlisted, and fail-closed under APP-03.
2. Submit the existing forward OWNER/invited-staff and entitlement contracts for independent review before protected implementation.
3. COM-01's versioned plan/price/quote/invoice/entitlement-event model is specified in `PHARMACYFLOW_COMMERCIAL_ARCHITECTURE.md`; no prices are fixed or published.
4. COM-03's provider-independent interface, Paystack adapter boundary, trusted raw-webhook verification, idempotent recording, and reconciliation state machine are specified but unimplemented.
5. COM-02's organization attribution, verified-settlement qualification, immutable award and append-only subscription-credit ledger are specified; issuance remains inactive until unresolved policy choices and protected implementation are approved.
6. Never use disconnected Admin fixtures as contracts or product data.

**Exit gate:** authorized local designs/tests complete; protected server components either independently verified or explicitly blocked; no live activation implied.

## M5 — MVP acceptance and release preparation

**Status:** PARTIAL / NOT READY

1. Merge evidence references into one acceptance matrix covering authentication, onboarding, tenant/role/branch isolation, core workflows, offline/reconciliation, entitlement, billing/referral, Admin, audit, browser/Android, migrations, recovery, accessibility, secrets, and operations.
2. Resolve the dependency-lock inconsistency without overwriting user-owned work and only within a separately approved dependency scope.
3. Complete independent GPT-6 review of the scoped dirty snapshot and refreshed manifests.
4. Request owner approval before any selective staging/commit.
5. Keep Dev inspection, disposable execution, migration, deployment, payment activation, and publication as separate exact approvals.
6. BLK-017 cleanup/source corrections are locally prepared. Do not run Edge disposable cases until their scoped manifest is independently reviewed and the exact disposable target/commands/writes/services/credentials/cleanup are separately authorized.

**Current readiness classification:** NOT READY. Critical server authorization, database concurrency/effects, real-browser durability, billing/referral implementation, Android, and deployment evidence remain open.

## Next authorized sequence

1. Independent incremental review of this M1 register and the already prepared AUTH/APP checkpoint.
2. Local design-only work for COM-01/COM-02/COM-03 and TEST-01, with no protected implementation.
3. Focused M2 local gaps that do not touch sealed/protected contracts.
4. Owner decisions for unresolved commercial fields.
5. Separate protected approvals for server-contract implementation, disposable acceptance, Dev read-only inspection, Git release snapshot, and deployment—in that order as dependencies require.

## REV-LIN-01 implementation review gate — 2026-10-26

The owner-approved transaction-entry policy is implemented locally in inactive injected contracts and additive unexecuted migration `000033`. Dispatch, exact resolution, completion and result lookup are separately authorized; original operation provenance is immutable; alternate recovery is applicant/context scoped and separately audited. Next: independent source/manifest review only. Authority-scope provisioning, runtime mapping, PostgreSQL/Auth/provider/browser/concurrency acceptance and rollout remain blocked and require new exact authority; AUTH-02 is deferred.

## ACC-01 contract-alignment review gate — PF-SUP-2026-10-26-16

The inactive acceptance harness now pins migrations through `000034`, uses the current v4/phase identity RPCs and contains owned disposable scope plus guarded cleanup source. Pending phase-security cases are authored but PostgreSQL not run. Genuine trusted-subject completion, completed replay and completion-audit rollback remain AUTH-02 blocked. The only next action is independent source/hash review; execution, provisioning and rollout remain unauthorized.

## PF-MVP-08 foundation security review gate — PF-SUP-2026-10-29-03

Strict request-bound entitlement evidence, exact committed replay authorization and deterministic administrative decisions are locally corrected with an additive unexecuted private SQL proposal. The source-backed matrix confirms application routes remain unwired. Independent review is next; protected server wiring, legacy/direct-table policy, PostgreSQL/concurrency acceptance and AUTH-02 require later explicit authorization.

PF-SUP-2026-10-29-04 completes the local acceptance correction: full-scope proof consumption, microsecond ordering, v2 effective evaluation, trusted producers and exact superseded-helper closure are authored and tested. Independent report/manifest review is the only next action; business-route wiring remains prohibited.
