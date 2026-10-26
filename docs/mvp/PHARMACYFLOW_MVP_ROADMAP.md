# PharmacyFlow five-milestone MVP roadmap

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
