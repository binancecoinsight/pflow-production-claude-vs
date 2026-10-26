# PharmacyFlow MVP-to-Release Roadmap

## Review reconciliation / I3A design gate — 2026-10-26

Owner-supplied transcript evidence now records PF-SUP-02 corrected-I2 suitability, PF-SUP-05 local I3 boundary/parity acceptance and PF-SUP-06 unchanged hashes/missing export. The prior conditional-gate assessment remains historical. I3A authority-registry and disposable-acceptance design is complete without implementation or execution. Next gates are independent review, then separate owner choices for registry governance, identity-provider feasibility, harness authoring and a named disposable acceptance authorization. AUTH-02, provider feasibility, runtime mapping, provisioning, signup, activation, M4/MVP and release remain open/blocked.

## PF-SUP-2026-10-26-04 I3 final parity gate — 2026-10-26

The owner-authorized local boundary/parity correction is authored in inactive façades, focused strict compilation and forward-only unexecuted migration `000032`. It closes RPC defaults, unifies pending/completed operation identity and separates issue completion from recovery-only completion. Stop for independent review before I3A or dependent work. PostgreSQL/Auth/provider/browser/concurrency acceptance, authority provisioning, signup, runtime adapters, activation and deployment remain outside scope; AUTH-02, M4/MVP and release readiness remain blocked.

## PF-SUP-2026-10-26-03 I3 correction gate — 2026-10-26

The bounded I3 source correction is authored in inactive façades plus forward-only unexecuted migration `000031`. It corrects durable issuance ordering/recovery, authoritative current permission checks, TS/SQL command binding, stable applicant identity and strict validation while preserving 000027–000030. Stop for independent review. The next possible milestone is a separately authorized authority-provisioning/disposable-acceptance **design** scope; execution, identities, credentials, provider integration, signup, activation and deployment remain excluded. AUTH-02, M4/MVP and release readiness remain blocked.

## BLK-002-I3 local authoring gate — 2026-10-26

The owner-authorized I3 local batch is authored but inactive/unexecuted: injected gateway/operator façades, least-privilege SQL contract, forward migration `000030`, tests and review evidence. Stop for incremental GPT-6 review. Any correction, provider validation, database execution, identity mapping, browser acceptance, activation or deployment is a later separately authorized milestone. AUTH-02 remains deferred; MVP-01/M4 and release readiness remain incomplete.

## BLK-002-I2 conditional design gate — 2026-10-26

I2 local design/feasibility and injected contract testing are complete. ADM-01/REV-01 policy is recorded; runtime implementation is absent. After incremental GPT-6 review, the next proposed dependency is separately authorized BLK-002-I3 local authoring of the gateway façade, operator façade, append-only audit/decision contract and one forward-only migration. Provider validation, migration execution, effective-privilege/RLS/concurrency evidence, Auth/browser acceptance and rollout remain later separately protected gates. MVP-01/M4 and release readiness remain incomplete.

## PF-SUP-2026-10-25-17 BLK-002-I1 correction gate

The bounded I1 correction is locally authored only. A forward-only migration preserves reviewed `000028`; the injected issuer is state-aware, marker comparison is field-explicit/order-independent, and confirmed post-correlation-failure continuation is a separate authenticated exact-operation contract. Focused pure/static models are permitted, but PostgreSQL/Auth/browser execution, real concurrency, gateway/provider implementation and rollout remain blocked. Next milestone: independent review of the separately hashed correction snapshot. Do not begin dependent protected work.

## PF-SUP-2026-10-25-12 reviewed handoff

The 30-file correction snapshot has completed scoped independent review with no new P0/P1. BLK-015–017 are locally reviewed; their real-system evidence gates remain open. BLK-012 is closed only as the incremental correction-review gate—not as broader release or MVP acceptance. The next dependency-ready milestone requires an explicit owner selection from `PHARMACYFLOW_OWNER_DECISION_PACKET_2026-10-25.md`. Recommended smallest choice: BLK-002 onboarding contract v1 local authoring and synthetic tests, separately from entitlement, execution, Git and deployment. AUTH-02 remains **NOT RUN — OWNER DEFERRED**; AUTH-03 remains **BLOCKED — ACCESS METHOD**.

## PF-SUP-2026-10-23-06 authorized local checkpoint

- **MVP-01:** protected onboarding/membership design is **APPROVED DESIGN / NOT IMPLEMENTED**; concurrency reservation, grants/RLS, auth-provider recovery and canonical replay are specified for independent review.
- **MVP-08:** local capability containment is **IMPLEMENTED — AWAITING INDEPENDENT REVIEW** across sales, inventory, refund/restock, customer, supplier, new-shift and enrollment mutations. Authoritative server enforcement remains **BLOCKED — APPROVAL**.
- **External acceptance:** **NOT RUN — OWNER DEFERRED** under AUTH-02. Preparation may be reviewed but execution should not be requested again in this batch.
- **PharmacyFlow-Dev:** **BLOCKED — ACCESS METHOD** because no technically enforced read-only method was available for AUTH-03.
- **Release/deployment:** manifests, compatibility, ordering, failure and recovery plans are prepared under AUTH-04/AUTH-05. Git mutation, deployment and publication remain prohibited.

## PF-SUP-2026-10-23-05 incremental checkpoint

- **MVP-01: IMPLEMENTED — UNVERIFIED (client integration).** M-16 acceptance validates its sealed response and is reachable for signed-in multi-membership users without a client-selected role. Atomic verified-user OWNER and invitation-aware bootstrap designs are ready; protected server implementation remains **BLOCKED — APPROVAL**.
- **MVP-08: IMPLEMENTED — UNVERIFIED (local capability boundaries).** Expiry preserves authorized reads and durable checkout review/recovery/acknowledgment while blocking new sale, inventory, refund and restock mutations. Trusted entitlement anchors and operation-level server enforcement remain **BLOCKED — APPROVAL**.
- **MVP-03/MVP-04/MVP-05 acceptance:** all external runners require the same disposable identity. Two-session evidence must prove actual overlap with distinct backend IDs and exact outcomes. These guards and harnesses are locally inspected and synthetically tested; database, Edge and browser execution is **NOT RUN**.
- **Release:** refresh the scoped manifests, obtain incremental GPT-6 review, then request exact protected execution authorization. Git mutation and deployment remain unauthorized; StoreFlow remains permanently prohibited.

## APP-01–APP-07 coordinated local checkpoint — 2026-10-23

- **MVP-01: IN PROGRESS.** Owner/staff UI paths are separated; direct unsafe OWNER signup is blocked; existing confirmed-email invitation acceptance is integrated. Trusted atomic OWNER onboarding and invited-user auth bootstrap remain **BLOCKED — APPROVAL/TECHNICAL CONTRACT**.
- **MVP-07: IMPLEMENTED — AWAITING INDEPENDENT REVIEW** for the approved minimal surface. Admin uses an explicit metadata allowlist, remains fail-closed and exposes no privileged mutations. Target authorization verification remains external.
- **MVP-08: IMPLEMENTED — UNVERIFIED** for advisory lifecycle/UI containment. UTC trial/grace/expiry boundaries are tested; authoritative server enforcement and offline acceptance provenance remain **BLOCKED — APPROVAL**.
- **MVP-03/MVP-04/MVP-05:** prior locally reviewed Phase B and Refund V2 work is preserved. Status-v2 and the corrected disposable-target acceptance bundle remain unexecuted.
- **MVP-06/MVP-09 preparation:** reporting dependencies and a clean isolated acceptance plan are recorded; no authoritative database reconciliation has occurred.
- **Release:** deployment and Git staging/commit/push remain unauthorized. Next high-risk gate is incremental GPT-6 review of this checkpoint, then owner-selected protected execution.

## PF-SUP-2026-10-23-03 executable acceptance preparation

C-01 through C-03 are **INDEPENDENTLY REVIEWED LOCALLY**. C-04 production adapters are **SYNTHETICALLY REVIEWED**; real React/browser behavior remains unverified. The Phase B verification package is now a reviewable execution bundle with fixed synthetic identities, exact preflight/test commands, real-database and real-browser assertions, evidence/cleanup forms, runtime and source manifests, and explicit committed-fixture rules for cross-session tests. No protected check was executed in this preparation batch.

The next milestone is owner-authorized execution against one positively identified disposable PharmacyFlow target and one named isolated browser profile, followed by independent evidence review. Database/migration/PostgREST/Edge/browser/Docker/port/service access, fixture commits/cleanup and deployment remain unauthorized until separately approved. Dependent financial feature work must not begin without a demonstrated defect.

## PF-SUP-2026-10-23-02 incremental closure

C-01–C-04 are locally corrected and the next PharmacyFlow-only verification package is ready for owner review. The next milestone is not further broad local auditing: it is positive target identification and separate authorization for the unexecuted package in `PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md`, followed by independent evidence review. Browser/database/service/deployment gates remain pending.

## PF-SUP-2026-10-22-01 incremental closure — 2026-10-23

B-01–B-07 local findings are corrected as one source/test/documentation batch. This supersedes earlier claims of complete local acceptance but does **not** mark Phase B accepted. Remaining gates: independent incremental review against the hash manifest; separately authorized status-v2 execution and role-aware SQL cases; PostgreSQL M-18 concurrency/rollback/PostgREST verification; real-browser IndexedDB and checkout lifecycle acceptance; deployed Edge/client compatibility; deployment approval. See `PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`.

## Authoritative correction to Phase B sequencing — 2026-10-22

MVP-03/MVP-04 local remediation is complete and synthetic acceptance is green. The next protected gate is not another implementation proposal: it is separately authorized execution and verification of the unexecuted status-v2 SQL, real database concurrency/rollback evidence, browser IndexedDB upgrade/contention acceptance, deployed Edge/client compatibility, and independent financial/security review. No automated legacy financial completion is planned. Older “Phase B implementation pending” milestone text below is historical and superseded here.

## Phase B local implementation checkpoint — 2026-10-22

MVP-03/MVP-04 protected source remediation is **implemented locally**: durable scoped checkout drafts, atomic v4 persistence/resolution, strict gateway evidence, fail-closed reconciliation, legacy quarantine and SQL-aligned idempotency mocks. The forward-only status-v2 migration is authored and unexecuted. Release gates remain: independent review, authorized PostgreSQL migration execution, SQL/concurrency evidence, deployed Edge/client compatibility, and production acceptance. Historical 6/6 characterization records unsafe reproduction only.

Baseline date: 2026-10-22. This roadmap is based on static repository evidence at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`; it is not evidence of remote deployment. Database operations performed during the baseline: none. StoreFlow access: none.

## Status and sequencing

The dependency order is MVP-01 -> MVP-02/MVP-03 -> MVP-04/MVP-05 -> MVP-06/MVP-07/MVP-08 -> MVP-09 -> production and release gates. Existing financial, synchronization, authentication, RLS, migration, and entitlement changes remain subject to independent review; remote inspection, migration, deployment, Git staging/commit/push, and database mutation require explicit owner approval.

## Milestones

### MVP-01 — Authentication, Onboarding and Membership

- Objective/status/original state: complete tenant-safe login, recovery, onboarding, staff membership, tenant and branch selection; **INVESTIGATING**; login, signup, restoration and pharmacy switching exist, but onboarding is inconsistent and staff/branch management UI is absent.
- Dependencies/remaining work: resolve OWNER bootstrap versus invited-staff signup policy; add recovery, invitation acceptance/staff management, explicit branch selection, revoked-membership tests, and role-appropriate navigation.
- Relevant files: `src/contexts/AuthContext.tsx`, `src/components/AuthScreen.tsx`, `src/components/AuthenticatedShell.tsx`, `src/components/NoMembershipScreen.tsx`, `supabase/migrations/20261004000002_m2_membership_roles.sql`, `supabase/migrations/20261011000016_m16_staff_management_rpcs.sql`.
- Risk/effort: high authorization risk; 5-10 engineering days after policy resolution.
- Acceptance/tests/review/evidence/blockers: authorized tenant and branch access survives restoration/switching; tests for restoration, revoked membership, cross-tenant and branch denial, role navigation; independent auth review required. Evidence: auth context lines 98-188 and 190-246, M-2 lines 192-237. Blocked in part by onboarding policy approval.

### MVP-02 — Products, Inventory and Expiry

- Objective/status/original state: reliable catalog, batches, intake, adjustments, expiry, low stock, transfers, and audit; **IMPLEMENTED — UNVERIFIED**; services, UI and focused tests exist.
- Dependencies/remaining work: verify expiry/low-stock UX, reconciliation and branch isolation against an approved isolated database; close any test defects without altering sealed migrations.
- Relevant files: `src/lib/inventory/`, `src/components/inventory/`, migrations M-5, M-13, M-14, M-15.
- Risk/effort: high stock-accounting risk; 3-6 days.
- Acceptance/tests/review/evidence/blockers: consistent tenant-isolated audited stock; catalog/intake/adjustment/transfer/expiry/reconciliation tests plus approved DB verification; independent stock review required. Evidence: inventory service RPC calls at lines 636, 743, 861 and 972. Blocker: database verification approval/identified target.

### MVP-03 — POS, Sales and Payments

- Objective/status/current state: exactly-once checkout with correct totals, payment and stock effects; **LOCALLY CORRECTED / EXTERNAL ACCEPTANCE PENDING**. Durable identity and SQL-aligned gateway conflict behavior are implemented and locally reviewed; real SQL/PostgREST/concurrency evidence remains open.
- Dependencies/remaining work: execute the approved Phase B bundle on a disposable PharmacyFlow target; verify M-18 replay/conflict/rollback/concurrency, consecutive receipts and authoritative effects; obtain independent financial review.
- Relevant files: `src/lib/pos/`, `src/components/pos/`, `src/lib/sales/`, `supabase/functions/sync-push-sale/`, migration M-18.
- Risk/effort: critical financial/inventory risk; 4-8 days.
- Acceptance/tests/review/evidence/blockers: one authorized consistent sale per intent; local synthetic evidence is green and independently reviewed for C-01–C-03, but approved concurrent database/PostgREST verification and independent financial review remain required. The historical 6/6 unsafe characterization is superseded correction evidence, not a current acceptance result.

### MVP-04 — Offline Durability and Synchronization

- Objective/status/current state: durable signed retry-safe offline operations; **LOCALLY CORRECTED / REAL-BROWSER AND DATABASE ACCEPTANCE PENDING**. Durable drafts, bounded initialization, lease completion, recovery integrity and stale-result guards are implemented locally.
- Dependencies/remaining work: execute the isolated browser upgrade/contention/restart/lifecycle matrix and status-v2 database authorization matrix; verify response-loss reconciliation and cross-session behavior.
- Relevant files: `src/lib/offline/`, `src/lib/crypto/`, `src/components/OfflineSyncRuntime.tsx`, sync Edge functions.
- Risk/effort: critical loss/duplication/security risk; 5-10 days.
- Acceptance/tests/review/evidence/blockers: no silent loss, false commit or duplicate effect; C-01–C-03 passed local independent review and C-04 adapters passed synthetic review. Real browser lifecycle, SQL authorization/concurrency and deployed Edge compatibility are **NOT RUN** and approval-gated.

### MVP-05 — Payments, Refunds and Financial Integrity

- Objective/status/original state: traceable exactly-once partial/full refunds with stock restoration; **IMPLEMENTED — AWAITING INDEPENDENT REVIEW** based on **HISTORICAL / REPORTED** local Refund V2 evidence, with live deployment unknown.
- Dependencies/remaining work: preserve M-20..M-25 and commit `d145324`; independently review current tree and verify reports/receipts against an approved target.
- Relevant files: `src/lib/sales/refundV2.ts`, `src/components/sales/ReturnModal.tsx`, `supabase/functions/sync-push-return-v2/index.ts`, migrations M-20..M-25.
- Risk/effort: critical financial risk; 2-5 days excluding deployment.
- Acceptance/tests/review/evidence/blockers: authorized tenant-isolated exactly-once refunds; critical suite, concurrency and Edge gates; independent review mandatory. Evidence: RC commit and historical 31/31, 10/10, EDGE-001..003 reports. Blockers: no current independent review evidence; remote deployment requires approval.

### MVP-06 — Reporting and Owner Dashboards

- Objective/status/original state: refund-adjusted branch-aware operational reporting; **IMPLEMENTED — UNVERIFIED**; report service and four report views exist.
- Dependencies/remaining work: reconcile totals against authoritative sale/refund records, validate access rules, pagination and expiry/low-stock coverage; avoid unsupported profit claims.
- Relevant files: `src/lib/reports/`, `src/components/reports/`.
- Risk/effort: high financial-reporting risk; 3-6 days.
- Acceptance/tests/review/evidence/blockers: retry/refund-safe reconciliation and role restrictions; calculation/UI tests plus approved DB fixtures; financial review required. Evidence: `generatePharmacyReport` and report test suite. Blocker: authoritative DB reconciliation approval.

### MVP-07 — Admin Support Operations

- Objective/status/original state: restricted audited support workflows; **PARTIALLY IMPLEMENTED**; Next.js auth boundary and an honest read-only readiness surface exist, with explicit loading/error/empty/partial states and no operational fixture substitution.
- Dependencies/remaining work: define approved support metadata/query mappings and backend actions, then add server authorization, persistence confirmation, privileged audits, and role-boundary tests. Operational controls stay disabled until those contracts exist.
- Relevant files: `apps/pharmacy-flow-admin/lib/auth*.ts`, `middleware.ts`, `components/Dashboard.tsx`, `lib/admin-data-readiness.ts`, `lib/mock-data.ts` (fixtures only).
- Risk/effort: critical privilege/privacy risk; 7-14 days after support-scope approval.
- Acceptance/tests/review/evidence/blockers: support sees only approved metadata and every mutation is authorized/audited; auth and action tests; independent admin review required. **EXECUTED ACCEPTANCE PASS:** 18/18 data-readiness assertions. **HISTORICAL / REPORTED:** auth 40/40 and build/type/lint. `select('*')` remains a documented data-minimization concern pending an approved field contract. Blocker: approved metadata/action specification and platform-admin boundary approval.

### MVP-08 — Subscription and Entitlement Enforcement

- Objective/status/original state: server-authoritative lifecycle and safe expiration; **PARTIALLY IMPLEMENTED**; schema/helper and staff-seat checks exist, but operational mutations do not call `is_subscription_active` and frontend only displays status.
- Dependencies/remaining work: approve grace/expiry/feature policy, then enforce it server-side and expose accurate status without inventing pricing.
- Relevant files: migration M-3, M-16, `src/contexts/AuthContext.tsx`, `src/components/AuthenticatedShell.tsx`.
- Risk/effort: critical commercial/authorization risk; 5-10 days after policy approval.
- Acceptance/tests/review/evidence/blockers: expired/ineligible tenants are denied according to approved policy; lifecycle, boundary and server enforcement tests; independent review required. Evidence: `is_subscription_active` is defined only in M-3 and has no runtime callers. Blocked by product-owner entitlement policy and protected-change approval.

### MVP-09 — Full MVP Acceptance

- Objective/status/original state: synthetic end-to-end workflow covering all 14 required steps; **NOT STARTED**; component capabilities exist but no integrated acceptance evidence exists.
- Dependencies/remaining work: MVP-01..08, isolated synthetic environment and an acceptance matrix.
- Relevant files: all active SaaS/Admin modules and test evidence.
- Risk/effort: critical release gate; 3-7 days after dependencies.
- Acceptance/tests/review/evidence/blockers: all essential steps PASS or release remains blocked; full suites plus approved E2E/integration; independent review required. Blocked by earlier milestones and environment approval.

### PROD-01 — Security and Tenant Isolation

- Objective/status/original state: no known critical privilege or isolation defect; **INVESTIGATING**; extensive RLS/helpers exist but only static evidence is current.
- Dependencies/remaining work: audit policies, grants, definer ownership/search paths, Edge service-role use and logs.
- Files/risk/effort: `supabase/migrations/`, functions and auth modules; critical; 5-10 days.
- Acceptance/tests/review/evidence/blockers: negative tenant/branch/admin tests and independent security approval; approved isolated DB required.

### PROD-02 — Offline Recovery and Reliability

- Objective/status/original state: recoverable interruption/crash/contention behavior; **NOT STARTED** beyond unit suites.
- Dependencies/remaining work: MVP-04, fault injection and corruption/reconciliation UX.
- Files/risk/effort: `src/lib/offline/`; critical; 4-8 days.
- Acceptance/tests/review/evidence/blockers: no silent loss/double commit under the required matrix; independent sync review; isolated integration environment required.

### PROD-03 — Financial and Inventory Stress Testing

- Objective/status/original state: invariants under concurrency/failure; **IMPLEMENTED — UNVERIFIED** for refund-specific historical gates, otherwise not run.
- Dependencies/remaining work: MVP-03/MVP-05, concurrent sale/refund/stock/tender tests.
- Files/risk/effort: financial RPCs, Edge functions, test scripts; critical; 4-8 days.
- Acceptance/tests/review/evidence/blockers: invariant-preserving stress results and independent review; approved PharmacyFlow-only DB required.

### PROD-04 — Performance and Scalability

- Objective/status/original state: evidence-led performance; **NOT STARTED**.
- Dependencies/remaining work: stable MVP contracts, representative synthetic datasets, query/render/queue profiling.
- Files/risk/effort: reports, history, inventory, indexes; medium; 4-8 days.
- Acceptance/tests/review/evidence/blockers: measured budgets and remediated demonstrated bottlenecks; review as changes warrant; synthetic environment required.

### PROD-05 — Backup, Recovery and Observability

- Objective/status/original state: operational detection/recovery; **PARTIALLY IMPLEMENTED** only as sanitized Edge JSON errors and local console messages.
- Dependencies/remaining work: logging taxonomy, alerts, runbooks, backup and rollback plans; no destructive rehearsal without approval.
- Files/risk/effort: functions and new operational docs; high; 5-10 days.
- Acceptance/tests/review/evidence/blockers: actionable sanitized signals and reviewed recovery procedures; independent recovery review required; infrastructure policy/approval needed.

### PROD-06 — Web and Android Readiness

- Objective/status/original state: secure web and Android artifacts; **PARTIALLY IMPLEMENTED**; root web build exists, while Capacitor appears only in the legacy app and no Android project is present.
- Dependencies/remaining work: identify canonical mobile source, add/verify Capacitor without privileged secrets, lifecycle/storage tests and signed packaging plan.
- Files/risk/effort: root Vite app, legacy `apps/pharmacy-flow saas/capacitor.config.ts`; high; 7-15 days.
- Acceptance/tests/review/evidence/blockers: reproducible web build and tested Android artifact; mobile security review required; signing/release approvals needed.

### PROD-07 — Independent Production Security Review

- Objective/status/original state: independent review of all consequential boundaries; **NOT STARTED**.
- Dependencies/remaining work: PROD-01..06 evidence bundle and P0/P1 closure.
- Files/risk/effort: repository-wide evidence; critical; external estimate.
- Acceptance/tests/review/evidence/blockers: explicit independent acceptance with severity ledger; blocked on preceding milestones and GPT-6 review.

### REL-01 — MVP Release Candidate

- Objective/status/original state: reproducible reviewed RC manifest; **PARTIALLY IMPLEMENTED** for Refund V2 only.
- Dependencies/remaining work: MVP-09/PROD gates, source/migration/function/env/test/security manifests.
- Files/risk/effort: repository and release docs; high; 2-4 days.
- Acceptance/tests/review/evidence/blockers: exact artifact tests and independent approval; Git staging/commit requires explicit owner approval.

### REL-02 — PharmacyFlow-Dev Deployment

- Objective/status/original state: controlled Dev deployment to project `lqzsfsmppoaibnzczmhf`; **BLOCKED — APPROVAL**; no remote inspection performed.
- Dependencies/remaining work: approved read-only identity/history comparison, recovery plan, then separate migration/function/app deployment approvals.
- Files/risk/effort: manifests/config/functions/migrations; critical; 1-3 days excluding remediation.
- Acceptance/tests/review/evidence/blockers: verified target, compatible history and signed synthetic smoke tests; independent review required; all remote operations approval-gated.

### REL-03 — Production Release Readiness

- Objective/status/original state: formal go/no-go package; **NOT STARTED**.
- Dependencies/remaining work: MVP acceptance, security approval, backup/rollback, monitoring and compatibility evidence.
- Files/risk/effort: release/operations docs; critical; 2-5 days.
- Acceptance/tests/review/evidence/blockers: every gate accepted and explicit production authorization; blocked on all prior gates.

### REL-04 — Launch and Stabilization

- Objective/status/original state: approved launch monitoring and incident correction; **BLOCKED — APPROVAL**.
- Dependencies/remaining work: REL-03, deployment authorization and operational ownership.
- Files/risk/effort: deployment/monitoring/incident records; critical; ongoing.
- Acceptance/tests/review/evidence/blockers: monitored stable release with reconciled financial/inventory behavior; production access and all mutations explicitly approval-gated.

## Incremental checkpoint PF-SUP-2026-10-25-09

BLK-017's Edge-runner cleanup source dependency is **IMPLEMENTED — UNVERIFIED**. The three runners now have shared identity-guarded cleanup and a zero-root proof; EDGE-002 owns its replay baseline. This advances M3/M5 preparation only and does not change any Phase B, M-18, Refund V2, sealed-migration, or deployment contract. Independent review precedes any protected execution. BLK-016's genuine authenticated/anonymous status-v2 PostgREST runner remains the next local preparation dependency.

PF-SUP-2026-10-25-10 prepares that status-v2 runner and its injected synthetic tests. BLK-016 remains blocked on independent review and explicit AUTH-02 execution authority, including an approved method for supplying short-lived target-signed fixed-subject JWTs. No status-v2 migration, fixture, PostgREST call or concurrency harness was executed.

## Incremental checkpoint after PF-SUP-2026-10-25-11

The local BLK-015–017 corrections were subsequently reviewed at PF-SUP-2026-10-25-12; their browser/database/PostgREST/Auth/concurrency/cleanup acceptance remains **NOT RUN — OWNER DEFERRED** under AUTH-02. Commercial work remains design/specification-model only. Disposable acceptance is a mandatory predecessor to Dev inspection/rollout; AUTH-03 remains **BLOCKED — ACCESS METHOD** and deployment is unauthorized. No earlier milestone is restarted and no protected contract was changed.

PF-SUP-2026-10-26-10 corrects ACC-01 execution fidelity without restarting I3. Independent review of the new scoped manifest is the only next step. Protected execution remains blocked until the exact executable cases, pinned target, credential delivery, committed-fixture lifecycle, evidence and cleanup permissions are separately authorized. Durable recovery concurrency, reservation/revocation concurrency, confirmed consumption and provider feasibility remain open; REV-LIN-01 and AUTH-02 remain deferred.

## Next proposed protected batch

## BLK-002 ACC-01 checkpoint

The I3A acceptance harness is locally authored and inactive. Its next step is independent review of the scoped SHA-256 manifest, not execution. After review, the smallest possible later owner scope would name the exact disposable target, ephemeral credential delivery, authorization expiry, exact concurrency scenario bodies, fixture/evidence writes and fixture cleanup. Provider/Auth/browser stages, environment destruction, identity provisioning, signup, activation and deployment remain separate and unauthorized. `REV-LIN-01` must be decided before its acceptance case can pass; AUTH-02 remains deferred.

PF-SUP-2026-10-26-08 corrections now pin an authoritative destination proof, narrow command grants, exact fixture ownership, fixed scenario bodies and sanitized evidence. Independent review of the new correction manifest remains the only next action. Real confirmed-applicant continuation needs a later Auth scope; REV-LIN-01 and AUTH-02 remain deferred.

1. **BLOCKED — OWNER AUTHORIZATION:** execute only the reviewed gates in `PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md` on the exact approved disposable PharmacyFlow target and isolated browser profile.
2. Require committed, identity-guarded fixtures for cross-session M-18/Refund V2 and cross-tab/restart cases; an enclosing rollback transaction is insufficient evidence.
3. Preserve sealed migrations, Refund V2 contracts and the independently reviewed C-01–C-04 corrections. Do not begin dependent financial features without a demonstrated defect.
4. Deployment, production access and Git mutation remain unauthorized and separate from acceptance execution. StoreFlow access is permanently prohibited for this workstream and cannot be authorized by a Phase B request.
