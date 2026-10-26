# PharmacyFlow Progress Ledger

## Review-evidence reconciliation and I3A design — 2026-10-26

- **RECONCILED:** owner-supplied transcript attributes PF-SUP-02 as corrected-I2 suitability for bounded I3 authoring, PF-SUP-05 as local I3 boundary/parity pass and PF-SUP-06 as unchanged-hash confirmation plus missing repository export. No omitted review detail is inferred.
- **HASH EVIDENCE:** PF-SUP-04 matched 12/12 before reconciliation; its implementation/configuration entries remain unchanged while three shared ledgers intentionally advanced into the new manifest. Unchanged tests were not rerun. The conditional-gate package remains preserved historical evidence and is prospectively superseded, not erased.
- **I3A DESIGN ONLY:** authority administration/separation, bootstrap, rotation, suspension/emergency revocation, audit, identity mapping and unexecuted PostgreSQL/Auth/provider/browser acceptance matrices are documented.
- **BLOCKED/OPEN:** provider capability, registry governance choices, harness authoring and every protected acceptance operation require later owner authority. AUTH-02 remains deferred.
- **DISPOSITION:** stop for independent review; no runtime implementation, provisioning, activation or acceptance authority is claimed.

## PF-SUP-2026-10-26-04 — I3 final boundary/parity correction — 2026-10-26

- **CORRECTED LOCALLY:** explicit signature ACL closure, global pending/completed operation identity, issue-versus-recovery completion parity and TS2775-safe assertion helpers.
- **FORWARD SQL ONLY:** unexecuted migration `000032` adds the global claim ledger/triggers, recovery-only completion and explicit v2/v3 RPC revokes/grants. Migrations 000027–000031 are unchanged.
- **EVIDENCE:** focused strict TypeScript PASS; root application TypeScript PASS; gateway 33/33; operator 25/25; I3 static 84/84; I2 44/44; issuer injected 39/39; issuer static 53/53; onboarding 28/28.
- **LIMIT/BLOCKER:** sequential mocks and static ACL checks are not PostgreSQL concurrency/effective-ACL acceptance. Authority provisioning/runtime mapping and provider validation remain absent; AUTH-02 remains deferred.
- **DISPOSITION:** stop for independent review before I3A or dependent implementation. Signup, adapters, activation, M4/MVP and rollout remain blocked.

## PF-SUP-2026-10-26-03 — BLK-002-I3 bounded correction — 2026-10-26

- **CORRECTED LOCALLY:** durable pre-provider issuance attempts, exact uncertain-outcome recovery, trusted-marker/account protections, stable email-digest applicant identity, strict validation and immutable replay.
- **SQL CONTRACT:** forward-only unexecuted migration `000031` adds authoritative fail-closed authority registries, TS/SQL canonical fingerprint parity, separate subject evidence and corrected v2 RPC grants; unsafe v1 executor grants are withdrawn. `000027`–`000030` are unchanged.
- **EVIDENCE:** gateway 18/18, operator 25/25, I3 static 56/56, I2 44/44, issuer injected 39/39, issuer static 53/53, onboarding 28/28, TypeScript PASS.
- **LIMIT:** synthetic/source evidence only; PostgreSQL/Auth/provider/browser/concurrency acceptance is unexecuted. Authority provisioning/runtime mapping is deliberately absent and blocked on an owner choice. AUTH-02 remains deferred.
- **DISPOSITION:** stop for independent correction review; I3 remains inactive and rollout/M4/MVP remain blocked.

## BLK-002-I3 local authoring — 2026-10-26

- **AUTHORIZED/COMPLETED LOCALLY:** inactive injected gateway/operator façades, shared identity/fingerprint contract, focused tests, static privilege contract and forward-only unexecuted migration `000030` are authored.
- **LEAST PRIVILEGE:** two NOLOGIN/NOBYPASSRLS executor roles have no memberships or direct table grants; proposed grants cover three gateway and two operator RPCs only, with public/anon/authenticated/service-role/opposite-role revocation.
- **RECOVERY/LOCKS:** current authority precedes replay; provider/database ambiguity requires exact recovery; admission/reservation share email serialization and eligibility revoke/consume share the target row. These are not real PostgreSQL results.
- **FRESH SAFE EVIDENCE:** gateway 16/16, operator 17/17, I3 static 42/42, corrected I2 44/44, issuer injected 39/39, issuer static 53/53, onboarding static 28/28 and focused strict TypeScript PASS.
- **CURRENT DISPOSITION:** I3 local authoring complete, inactive and unexecuted; independent review required. AUTH-02 is deferred. M4/MVP/rollout remain blocked.

## PF-SUP-2026-10-26-01 — BLK-002-I2 specification correction — 2026-10-26

- **REPRODUCED AND CORRECTED:** audit failure no longer leaves effects/results; recovery rechecks trusted current authority; fingerprints derive from typed commands rather than caller hashes; rotated credentials retain stable actor operation identity; replay results are deep-immutable.
- **FRESH SAFE EVIDENCE:** corrected I2 injected model 44/44, issuer injected 39/39, issuer static/synchronous 53/53, onboarding static/synchronous 28/28 and focused strict TypeScript PASS. The first post-correction typecheck exposed two test-only excess-property typing errors; those assertions were rewritten without changing runtime intent and the corrected typecheck passed.
- **LOCK RECONCILIATION:** current `000029` reservation and current `000028` revoke/consume lock sequences are documented separately from the proposed I3 hierarchy. Sequential order assertions are not PostgreSQL concurrency evidence.
- **CURRENT DISPOSITION:** I2 specification correction complete locally, independent review required. Provider/Auth/PostgreSQL/RLS/concurrency/browser evidence remains unverified. I3 is not started or authorized.

## BLK-002-I2 — gateway/provider design and feasibility — 2026-10-26

- **CONDITIONAL LOCAL COMPLETION:** current contracts were reconciled and a dedicated-workload-principal/narrow-façade architecture was selected. Provider exact-operation recovery and workload authentication remain unverified blockers.
- **POLICY CONTRACTS:** ADM-01 separates explicitly authorized platform operators from gateway/applicant identities. REV-01 separates admission and eligibility revocation and makes race ordering deterministic by authoritative row locks.
- **FRESH SAFE EVIDENCE:** I2 injected 28/28, issuer injected 39/39, issuer static/synchronous 53/53 and onboarding static/synchronous 28/28 passed. No PostgreSQL, Auth/provider, network, Docker, browser or deployment operation ran.
- **NEXT GATE:** independent incremental review, then explicit owner choice on BLK-002-I3 local protected authoring. M4/MVP/rollout remain blocked.

## PF-SUP-2026-10-25-17 — BLK-002-I1 local correction

- **LOCALLY CORRECTED — REVIEW REQUIRED:** issue/retry follows monotonic ledger state. `EMAIL_CONFIRMATION_PENDING`, `ACTIVE` and `CONSUMED` exact retries cannot call the Auth-pending transition; stale and terminal rows cannot be revived.
- **AUTHORITY COMPARISON CORRECTED:** required issuer version, OWNER contract version, request ID, provider-operation ID and fingerprint are compared explicitly without JSON serialization or key-order dependence.
- **RECOVERY CONTRACT CORRECTED:** an Auth-created/correlation-failed/confirmed identity continues only through authenticated subject plus exact provider-operation recovery. Normal issue, signup and session refresh do not perform this transition; unrelated confirmed/staff identities remain unmodified.
- **FORWARD SQL ONLY:** reviewed migration `000028` remains unchanged. Unexecuted `000029` adds typed competing-first-reservation behavior, immutable admission evidence responses, exact recovery and version-bound consumption policy. It adds no gateway grant.
- **EVIDENCE BOUNDARY:** focused injected and static/synchronous tests pass locally. They are not PostgreSQL concurrency, RLS, Auth-provider, browser or rollout evidence.
- **CURRENT DISPOSITION:** BLK-002 remains **LOCAL CORRECTION AUTHORED — INDEPENDENT REVIEW REQUIRED — GATEWAY/PROVIDERS INCOMPLETE — DATABASE/AUTH/BROWSER ACCEPTANCE NOT VERIFIED — ROLLOUT BLOCKED**. M4 and MVP remain incomplete; AUTH-02 remains **NOT RUN — OWNER DEFERRED**.

## PF-SUP-2026-10-25-15 — BLK-002 reviewed correction and issuer design gate

- **INDEPENDENT SOURCE REVIEW COMPLETE:** the 16-file BLK-002 correction snapshot at manifest SHA-256 `2e6f268d4f0f3c9cb57007723482c951b8ecacf96e5853cbfb60a375d55b2398` was reviewed. Prior demonstrated P1 source findings are addressed; no new P0/P1 was demonstrated.
- **REVIEWED EVIDENCE:** client 30/30, static/synchronous model 28/28, staff bootstrap 20/20, TypeScript and manifest 16/16 passed in the reviewed snapshot. This does not establish SQL privileges, Auth/provider, browser or rollout behavior.
- **DESIGN-ONLY HANDOFF:** issuer state/authority, effective-privilege acceptance and future focused cases are specified in separately hashed PF-SUP-2026-10-25-15 documents. No issuer or provider was implemented.
- **CURRENT DISPOSITION:** BLK-002 is **LOCALLY REVIEWED SOURCE — ISSUER/PROVIDERS INCOMPLETE — DATABASE/BROWSER ACCEPTANCE NOT VERIFIED — ROLLOUT BLOCKED**. Neither M4 nor MVP is complete. AUTH-02 remains **NOT RUN — OWNER DEFERRED**.
- **NEXT DECISION:** owner may separately approve `BLK-002-I1` local authoring only. This checkpoint and generic continuation do not grant that authority.

## PF-SUP-2026-10-25-14 — BLK-002 security/rollout correction

- **LOCALLY CORRECTED — REVIEW REQUIRED:** owner signup is disabled by default and has no production provider; missing server-first readiness makes zero Auth calls. Routine session resolution no longer invokes onboarding; recovery is explicit and request-ID preserving.
- **POLICY RESOLVED:** only a confirmed identity with server-written, subject/request/version-bound `OWNER_ONBOARDING_V1` app metadata is OWNER-eligible. Staff-bootstrap identities are explicitly denied. Client metadata is descriptive only.
- **PRIVILEGE CORRECTED:** the proposed dedicated role is `NOBYPASSRLS`; column grants and role-specific RLS policies are enumerated in `PHARMACYFLOW_BLK002_SECURITY_ROLLOUT_2026-10-25.md`. Database validity remains unexecuted and requires independent privilege review.
- **STAFF BOUNDARY CORRECTED:** reservation evidence is fully bound before Auth work; confirmed existing identities are unmodified; ambiguous recovery is provider-operation correlated; partial marker/completion failure is idempotently recoverable in injected models.
- **BLOCKER DISPOSITION:** BLK-002 remains **LOCALLY AUTHORED — INDEPENDENT REVIEW REQUIRED — EXECUTION/ROLLOUT BLOCKED**. AUTH-02 remains **NOT RUN — OWNER DEFERRED**.

## PF-SUP-2026-10-25-12 — reviewed correction handoff

- **SCOPED INDEPENDENT REVIEW COMPLETE:** the 30-file correction snapshot was reviewed; no new P0/P1 was identified. BLK-015–017 are locally reviewed at source/synthetic level.
- **P2 CORRECTED:** the Phase B authorization proposal now identifies current reviewed status-v2 runner hash `13f234…`; prior `d44b5e…` is explicitly historical. No authority is created by this edit.
- **STILL UNVERIFIED:** real browser, Auth/PostgREST, SQL, deterministic concurrency and elevated cleanup. AUTH-02 remains **NOT RUN — OWNER DEFERRED**.
- **DECISION READY:** `PHARMACYFLOW_OWNER_DECISION_PACKET_2026-10-25.md` separates BLK-002 onboarding, BLK-003 entitlement, BLK-004/005/013 policies, BLK-009 dependency repair and AUTH-03 access method. The smallest recommended next milestone is separately authorized onboarding-contract local authoring/synthetic testing only.
- **RELEASE BOUNDARY:** BLK-012 no longer awaits this scoped review, but the older release manifests remain historical and confer no staging, commit, MVP or deployment acceptance.

## PF-SUP-2026-10-23-06 / AUTH-01–AUTH-05 checkpoint — 2026-10-23

- **IMPLEMENTED — AWAITING INDEPENDENT REVIEW:** advisory capability boundaries for customers, suppliers, new cash-shift opening and device enrollment; preserved historical reads, existing-shift reconciliation and device security/recovery; scope-safe restricted draft retirement.
- **EXECUTED ACCEPTANCE PASS — SYNTHETIC:** lifecycle 15/15, capability boundary 5/5 and Phase B 61/61 using existing in-memory/fake-IndexedDB dependencies; production capability wiring static check passed; TypeScript no-emit passed; complete repository-contained runner 37/37 suites passed.
- **VERIFIED STATIC:** protected onboarding/entitlement/offline-evidence design, acceptance runner target/lock/session cleanup guards, dependency-complete release preparation and deployment/recovery plan.
- **NOT RUN — OWNER DEFERRED:** database, SQL, migrations, Docker, concurrency runners, Edge/integration runners and real-browser storage.
- **BLOCKED — ACCESS METHOD:** AUTH-03 PharmacyFlow-Dev metadata inspection. No demonstrably enforced read-only credential/delegation was available; no remote request occurred.
- **BLOCKED — APPROVAL:** protected server implementation after independent review, any Git mutation, migration/deployment/publication, and any future signed offline-grant design.
- **PRESERVED:** M-18, Refund V2, sealed migrations, stable IDs/frozen payloads, conservative UNKNOWN and legacy quarantine. StoreFlow was not accessed.

## PF-SUP-2026-10-23-05 local correction batch — 2026-10-23

- **CORRECTED SOURCE:** sealed M-16 response validation and authenticated invitation reachability; capability-level subscription containment; no replacement checkout after restricted recovery acknowledgment; inventory/refund/restock mutation containment.
- **EXECUTED SYNTHETIC/STATIC:** M-16 SQL-shaped onboarding cases 18/18; lifecycle/capabilities 13/13; Phase B restricted-entry/recovery cases 59/59; injected/static acceptance-target guards; TypeScript no-emit; complete repository-contained runner 35/35 suites. These are not database/browser evidence.
- **PREPARED / UNEXECUTED:** one identity-guarded command graph for Gate A/B, Refund and Edge; deterministic two-backend concurrency harness; forward-only atomic onboarding and authoritative entitlement designs.
- **OPEN / APPROVAL-GATED:** protected onboarding/entitlement implementation; disposable environment creation; SQL/migration/PostgREST/Edge/concurrency execution; real-browser lifecycle/IndexedDB checks; independent financial/security review; Git staging/commit and deployment.
- **PRESERVED:** previously reviewed Phase B fixes, status-v2 artifact, sealed migrations and Refund V2 contracts. Automated legacy financial completion remains out of scope.
- **BOUNDARY:** no database, migration, Docker, port, service, credential, browser datastore, remote, deployment, Git mutation or StoreFlow access occurred.

## APP-01–APP-07 local implementation checkpoint — 2026-10-23

- **IMPLEMENTED LOCALLY:** owner/staff entry-path separation; fail-closed direct OWNER signup; M-16 invitation acceptance integration; advisory UTC lifecycle/grace mapping; subscription mutation-capable navigation containment; Admin five-column query/normalization allowlist.
- **EXECUTED SYNTHETIC/STATIC:** onboarding 13/13; subscription lifecycle 10/10; Admin readiness 20/20; root TypeScript no-emit passed; complete repository-contained runner 34/34 suites.
- **PRESERVED:** independently reviewed C-01–C-03, synthetically reviewed C-04 adapters, status-v2 source, M-18/Refund V2 contracts and all unrelated dirty/untracked work.
- **PREPARED / UNEXECUTED:** new isolated target `pharmacyflow-mvp-acceptance-20261023` plan; PharmacyFlow-Dev read-only inspection plan for `lqzsfsmppoaibnzczmhf`; updated Phase B parameterized target guards.
- **BLOCKED — APPROVAL/CONTRACT:** trusted atomic OWNER onboarding; safe invited-user auth bootstrap; authoritative subscription enforcement/offline entitlement provenance; actual database/browser/Docker/service/remote inspection; Git staging/commit; deployment.
- **EVIDENCE BOUNDARY:** local tests do not establish database authorization, exactly-once effects, real browser lifecycle, remote compatibility or deployment. No database, migration, Docker, browser datastore, port, credential, service, remote, Git mutation or StoreFlow operation occurred.

## PF-SUP-2026-10-23-03 executable acceptance preparation

- **INDEPENDENTLY REVIEWED LOCAL:** C-01 concurrent initialization, C-02 storage lifecycle enforcement and C-03 recovery integrity passed local independent review. Their corrections were preserved without reopening.
- **SYNTHETICALLY REVIEWED:** C-04 production adapters for customer lookup/create, product search, barcode and duplicate selection passed synthetic review. Actual React/browser state and unmount behavior remain unverified.
- **AUTHORED / UNEXECUTED:** `PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md` is now an execution bundle with fixed synthetic fixture identities, exact preflight/local/external command forms, role/ownership and absence assertions, M-18 and Refund V2 concurrency rules, a real-component browser lifecycle runbook, evidence/cleanup templates, runtime requirements, abort rules and a scoped SHA-256 source manifest.
- **EVIDENCE BOUNDARY:** no database, migration, browser datastore, Docker, port, service, credential, deployment or StoreFlow access occurred. No protected check was executed. Source inspection and bundle validation are not external acceptance.
- **OPEN / APPROVAL-GATED:** status-v2 migration and role-aware SQL/PostgREST cases; M-18 replay/conflict/rollback/concurrency and actual gateway shapes; Refund V2 disposable-target compatibility; real-browser IndexedDB upgrade/contention/restart/lifecycle and consecutive receipt/scope transitions; cleanup proof; independent financial/security evidence review.
- **DEPLOYMENT:** unauthorized. Phase B is not accepted from local green tests or from this preparation result.
- **STOREFLOW:** permanently prohibited for this workstream; no Phase B authorization may include StoreFlow access.

## PF-SUP-2026-10-23-02 local result

- **CORRECTED SOURCE:** bounded concurrent initialization convergence and visible retry; DRAFT-only first freeze with explicit durable replay; recomputed recovery digests; consistent production-adapter stale-result rejection for customer lookup/create, product search, barcode resolution and duplicate selection.
- **EXECUTED SYNTHETIC:** TypeScript no-emit; focused Phase B 56/56; POS 76/76; POS UI 68/68; sales 83/83; offline 80/80; Refund V2 7/7; return sync 18/18; receipts 35/35; sale gateway 70/70; complete root runner 32/32 suites. These are local fake-IndexedDB, in-memory, injected-adapter or static checks—not browser/database acceptance.
- **AUTHORED / UNEXECUTED:** `PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md` with expected results, abort rules and evidence requirements.
- **OPEN:** real browser, database, PostgREST, concurrency, deployed compatibility, independent review and deployment approval.

## PF-SUP-2026-10-22-01 acceptance-closure result — 2026-10-23

- **CORRECTED LOCAL SOURCE:** B-01 lease commit completion; B-02 retired ownership/explicit replacement; B-04 checkout-keyed reset, delayed-result rejection and explicit durable recovery; B-05 M-18 error normalization/terminal conflict; B-06 recovery order; B-07 frozen time/evidence fidelity.
- **CORRECTED, AUTHORED, UNEXECUTED:** B-03 follows management, cashier-own-sale and permitted-return visibility and denies inaccessible existing operations before absence. No SQL was executed.
- **EXECUTED SYNTHETIC:** TypeScript no-emit; Phase B 41/41; gateway 70/70; sales 83/83; POS 76/76; POS UI 68/68; offline 80/80; receipts 35/35; complete root runner 32/32 suites. These are fake-IndexedDB, in-memory, injected-adapter or static checks, not SQL/browser/service acceptance.
- **OPEN / APPROVAL-GATED:** SQL cases, real database concurrency/rollback/PostgREST verification, browser acceptance, independent review, deployed compatibility and deployment.

The detailed disposition, evidence and manifest are in `PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`.

## Authoritative Phase B correction checkpoint — 2026-10-22

- **IMPLEMENTED SOURCE:** additive IndexedDB v4 checkout drafts; revision-owned snapshots; stable checkout/operation/sale/item/time identities; atomic freeze and atomic CAS resolution; non-reacquirable `SYNCING` leases; monotonic terminal outcomes; POS scope-generation guards; pre-validation durable retry retrieval; strict status evidence; sanitized gateway errors; and Refund V1/V2-specific handling.
- **EXECUTED SYNTHETIC ACCEPTANCE:** TypeScript no-emit; Phase B 32/32; gateway 68/68; offline 80/80; Refund V1 18/18; refund recovery 45/45; POS 76/76; POS UI 68/68; sales 82/82; inventory 71/71; Admin readiness 18/18. After side-effect inspection, the complete root runner passed 32/32 suites. These used fake IndexedDB, in-memory models, injected fetches, or static assertions only.
- **AUTHORED, UNEXECUTED:** `supabase/migrations/20261014000026_client_operation_status_v2.sql`. Sealed migrations M-6, M-10 and M-18 were not edited.
- **PENDING SEPARATE AUTHORIZATION:** migration execution, SQL syntax/replay evidence, database concurrency/rollback verification, real browser IndexedDB upgrade/contention acceptance, Supabase/Edge compatibility, deployment, and production acceptance.
- **EVIDENCE RULE:** the historical 6/6 characterization reproduced unsafe pre-remediation observations. It is not acceptance evidence and does not override the executed positive suites above.

All older “implementation pending” and “next approval is Phase B implementation” statements below are retained as historical Phase A context and are superseded by this checkpoint.

## Latest Phase B checkpoint — 2026-10-22

- **Implemented source:** IndexedDB v4 durable checkout drafts and atomic freeze/resolution; stable POS identities and restart/acknowledgment/cancellation behavior; explicit uncertain/conflict/recovery states; status-v2 client adapter; strict unified-sale gateway validation and sanitized error mapping; SQL-aligned replay mocks; Refund V2 dispatcher regression.
- **Executed synthetic acceptance:** TypeScript no-emit check plus isolated fake-IndexedDB/in-memory/injected-fetch suites. No real browser datastore, network, service or database was accessed.
- **Authored, unexecuted:** `supabase/migrations/20261014000026_client_operation_status_v2.sql`.
- **Still pending:** PostgreSQL execution, migration replay, SQL/concurrency verification, browser IndexedDB acceptance, Supabase/Edge integration, deployment and independent financial/security review.
- The earlier 6/6 characterization is historical unsafe-observation reproduction, not acceptance.

## Last verified checkpoint

- Date: 2026-10-22
- Branch/HEAD: `main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`; `origin/main` points to the same commit.
- Current batch: Phase A protected sales/synchronization characterization reconciliation and Phase B design complete; Phase B implementation remains approval-gated.
- Active milestones: MVP-03 and MVP-04 are **PARTIALLY IMPLEMENTED — PROTECTED REMEDIATION PENDING**. MVP-07 remains **PARTIALLY IMPLEMENTED** with a read-only fail-closed surface.
- Completed milestones: none at whole-product acceptance level. Refund V2 is locally implemented with historical passing evidence, awaiting independent review and deployment approval.
- Database operations: none. Docker operations: none. Remote connections: none. StoreFlow access: none.

## Architecture baseline

- Active SaaS: root React 19 + TypeScript + Vite 8 application in `src/`; Supabase JS/Auth; IndexedDB offline queue; Edge function gateways; PostgreSQL migrations/RLS/RPCs.
- Admin Support: separate Next.js 15 application in `apps/pharmacy-flow-admin`; Supabase SSR auth boundary; the operational dashboard is now a minimal read-only readiness view and no longer imports demo fixtures or claims local-only actions succeeded.
- Legacy/reference SaaS: tracked `apps/pharmacy-flow saas` Vite tree, including the repository's only Capacitor config. It is not the root build target and must not be treated as canonical without a decision.
- Database: 27 ordered SQL migrations from foundation through M-25 plus one TypeScript security test stored in the migrations directory.
- Edge functions: `sync-push-sale`, `sync-push-return`, and `sync-push-return-v2`.
- Build/test: root scripts provide TypeScript lint, Vite build, 31-suite test runner and 10-suite critical runner; Admin provides Next build/lint but no package test script.

## Working tree preservation

The scoped Phase A baseline remains `main`/`origin/main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`. Existing Admin, package/test-runner, sales/sync, Refund/Edge and temporary-file changes remain modified or untracked and are treated as user-owned. No concurrent branch/HEAD change was observed since the prior checkpoint. No reset, staging, commit, overwrite or destructive operation is authorized.

## Feature inventory

| Domain | Classification | Evidence and remaining gap |
|---|---|---|
| A Authentication | PARTIALLY IMPLEMENTED | Login/signup/logout/restoration exist; no password recovery tests; onboarding semantics conflict. |
| B Pharmacy onboarding | PARTIALLY IMPLEMENTED | M-2 auth trigger bootstraps a pharmacy, but UI omits pharmacy details and calls signup staff registration. |
| C Multi-pharmacy membership | IMPLEMENTED BUT NOT VERIFIED | Active memberships and tenant switcher exist; needs revoked/cross-tenant integration evidence. |
| D Role-based access | PARTIALLY IMPLEMENTED | DB permission matrix/RLS exists; navigation is incompletely gated and no active-app staff management UI exists. |
| E Product catalogue | IMPLEMENTED BUT NOT VERIFIED | CRUD/search/barcode service and UI tests exist. |
| F Batch inventory | IMPLEMENTED BUT NOT VERIFIED | intake, batches, adjustments and transfers use RPCs; needs DB reconciliation. |
| G Expiry tracking | IMPLEMENTED BUT NOT VERIFIED | expiry helpers/statuses and expired adjustment exist; acceptance coverage incomplete. |
| H Stock adjustments | IMPLEMENTED BUT NOT VERIFIED | authoritative RPC/UI/test exists; needs approved DB verification. |
| I Sales processing | PARTIALLY IMPLEMENTED | POS/local queue exists, but checkout identity is not durable and the uncommitted unified gateway path has protected response/idempotency defects. |
| J Payments | PARTIALLY IMPLEMENTED | single payment method and cash tender are recorded; advertised split-tender behavior is not evident in active UI/service. |
| K Offline durability | PARTIALLY IMPLEMENTED | IndexedDB/state/lease/retry logic exists, but no durable checkout draft or explicit uncertain/recovery state exists. |
| L Cloud synchronization | PARTIALLY IMPLEMENTED | Signed gateways exist, but status evidence is insufficient and ambiguous outcomes can flow back to retry. |
| M Refunds | IMPLEMENTED BUT NOT VERIFIED | Refund V2 local RC and historical gates exist; independent review/remote deployment absent. |
| N Reports | IMPLEMENTED BUT NOT VERIFIED | refund-aware services and report views/tests exist; authoritative reconciliation absent. |
| O Admin Support | PARTIALLY IMPLEMENTED | Secure login boundary and honest read-only account readiness exist; subscription/location/financial fields are unavailable until approved mappings exist, and privileged actions are disabled. |
| P Subscriptions/entitlements | PARTIALLY IMPLEMENTED | schema/helper/seat checks and display exist; general server-side operation enforcement absent. |
| Q Audit logging | IMPLEMENTED BUT NOT VERIFIED | immutable audit table/triggers and financial inserts exist; complete action coverage not verified. |
| R Device lifecycle | IMPLEMENTED BUT NOT VERIFIED | enrollment/block/rotate/delete services and crypto tests exist; approved integration verification absent. |
| S Web deployment | IMPLEMENTED BUT NOT VERIFIED | build/server config exists; no CI/hosting manifest or deployed-environment evidence. |
| T Android deployment | PARTIALLY IMPLEMENTED | only legacy tree has Capacitor config; no Android project/artifact evidence. |
| U Error/recovery | PARTIALLY IMPLEMENTED | Local errors/retries exist; plain-object classification, authoritative-result validation, unknown/absent separation and atomic local resolution are incomplete. |
| V Operational monitoring | NOT IMPLEMENTED | sanitized Edge errors exist, but no monitoring/alerting/runbook integration is present. |

## Files modified in this checkpoint

- New development memory: `docs/development/PHARMACYFLOW_ROADMAP.md`, `PHARMACYFLOW_PROGRESS.md`, `PHARMACYFLOW_DECISIONS.md`.
- Admin fail-closed/data-honesty/build portability: `apps/pharmacy-flow-admin/components/Dashboard.tsx`, `lib/admin-data-readiness.ts`, `app/layout.tsx`, `app/globals.css`, `next.config.ts`.
- Admin behavioral evidence: `apps/pharmacy-flow-admin/lib/dashboard-data-boundary.test.mjs`.
- Test-runner portability: root `package.json`, `scripts/run-tests.ts`, `scripts/typescript-loader.mjs`.
- Protected defect evidence only: `scripts/protected-sales-sync-characterization.ts` and `docs/development/PHARMACYFLOW_PROTECTED_SALES_SYNC_DEFECTS.md`. No protected production implementation was changed in this checkpoint.
- Phase B design only: `docs/development/PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`.
- Pre-existing dirty sale/sync/test files listed above were preserved; their content was not authored as part of the Admin milestone.

## Tests and evidence

> **6/6 characterization passing means six unsafe observations remain. There are two synthetic behavioral checks and four source-text checks across five defect families. This is not SQL or concurrency verification.**

- **EXECUTED DEFECT REPRODUCTION:** `scripts/protected-sales-sync-characterization.ts`, 6/6 unsafe observations reproduced using local source, WebCrypto and injected in-memory dependencies.
- **EXECUTED ACCEPTANCE PASS:** Admin data-readiness behavioral test, 18/18 assertions, after import/side-effect inspection; this preserves missing/loading/error/empty/partial and disabled-operation behavior only.
- **EXECUTED ACCEPTANCE PASS:** `git diff --check`.
- **HISTORICAL / REPORTED:** root lint, 10/10 critical suites, 31/31 full suites, root/Admin builds, Admin type-check/lint and Admin auth 40/40 were reported at the previous checkpoint and were not rerun in this Phase A batch.
- **HISTORICAL / REPORTED:** clean migration replay, Refund V2 database concurrency and EDGE-001..003.
- **NOT RUN:** any database, browser IndexedDB, Docker, network, migration, server or deployment verification.

## Outstanding risks and pending decisions

1. Public signup always creates an OWNER tenant in M-2, while the UI advertises staff registration and M-16 expects invitation acceptance.
2. `is_subscription_active` has no operational callers outside its definition; expired entitlement behavior is not product-approved.
3. Admin Support now presents only the current pharmacy read's identifier/name fields. Approved field mappings, backend actions, authorization, persistence and audit contracts are still absent, so operational controls remain disabled.
4. Current uncommitted changes alter the sale gateway/authoritative commit path and must receive financial/security review. The five defect families are durable identity, legacy recovery, error/response validation, reconciliation, and idempotency alignment.
5. Root app has no Capacitor/Android project; the only mobile config belongs to the legacy/reference tree.
6. Admin still queries `pharmacies` with `select('*')`. The presentation discards unsupported fields, but over-fetching remains a data-minimization concern; query narrowing requires an approved metadata contract.
7. M-18 can support strict direct-response validation without modification, but the current status RPC cannot prove unified-sale identity/effects or distinguish authorized absence from no visibility.

## Next authorized action

Obtain explicit approval for the cohesive protected Phase B package in `PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`. That request includes local protected client/gateway/test changes, an additive IndexedDB v4 store, and authoring—but not executing—one forward-only status RPC v2 migration. Database execution, concurrency acceptance and deployment remain separately approval-gated.

## PF-SUP-2026-10-25-09 — Edge cleanup source blocker closure

- **IMPLEMENTED — UNVERIFIED:** BLK-017 local source correction. `edge-fixture-cleanup.mjs` provides exact fixture/Auth/bootstrap identity checks, guarded graph deletion, replication-role restoration, zero-root proof parsing, and failure preservation.
- **IMPLEMENTED — UNVERIFIED:** EDGE-001/002/003 invoke the shared cleanup for success and failure. EDGE-002 is self-contained and establishes its own committed replay baseline.
- **EXECUTED SYNTHETIC/STATIC:** four Node syntax checks passed; cleanup synthetic test passed; target-guard test passed; acceptance runner verifier passed 27/27; scoped `git diff --check` passed.
- **NOT RUN:** database, Auth, Edge, Docker, ports, credentials, browser storage, migrations, concurrency and deployment. Cleanup and Refund V2 effects remain external acceptance claims only.
- **NEXT GATE:** incremental independent review of `M1_M4_REVIEW_MANIFEST.sha256`. BLK-016/status-v2 genuine PostgREST preparation remains the next dependency-ready local acceptance artifact; executing it or any existing runner requires separate owner authorization.

## PF-SUP-2026-10-25-10 — status-v2 PostgREST preparation

- **IMPLEMENTED — UNVERIFIED:** genuine PostgREST status-v2 runner with 23 role/ownership/absence cases, target/source/token preflight and sanitized exact assertions.
- **EXECUTED SYNTHETIC/STATIC:** injected runner tests pass 21 assertions; no external access occurs when source hashes mismatch.
- **NOT RUN:** JWT issuance/signing, Auth, PostgREST, database fixtures, migration, grants/RLS, Docker, ports, services, concurrency and cleanup.
- **BLOCKED BY EXECUTION AUTHORIZATION:** BLK-016 remains open until independently reviewed execution on the exact disposable PharmacyFlow target. The token issuance method is a consequential approval item; this batch does not authorize reading or using a JWT secret.

## PF-SUP-2026-10-25-11 — local acceptance/specification closure

- **LOCALLY CORRECTED:** BLK-016 credential preflight and response assertions. Anon input accepts only a target-bound anon JWT; secret/service credentials fail before external access. Actor claims require exact target/issuer/audience/subject and at most 15 minutes. Decoding is explicitly unverified provenance. Response validation binds exact fixture IDs, nested effects, operation provenance and SQL fixture timestamps; HTTP is bounded and redirects fail.
- **EXECUTED INJECTED:** status-v2 41 assertions plus an entirely injected 23/23 orchestration; preflight failures prove zero injected external calls. This is not signature, PostgREST, grant, RLS or database evidence.
- **LOCALLY CORRECTED:** BLK-017 known-user cleanup verifies UUID/email in both directions and proves absence against original expected roots; ambiguous Auth-create cleanup remains separately email-constrained and fail-closed. Actual Auth/SQL cleanup is unexecuted.
- **SPECIFICATION MODEL:** commercial transitions are monotonic, terminal evidence cannot revive, compensation replay/conflict is stable and cumulatively bounded, ambiguous credit is held, and every path follows one declared lock hierarchy. The 45 passing model cases do not prove PostgreSQL concurrency.
- **LOCALLY CORRECTED:** capability invalidation clears production busy states for customer, supplier, device and cash mutation surfaces. Nine scope/expiry/renewal boundary assertions pass; real React/browser acceptance remains unexecuted.
- **LOCALLY CORRECTED:** deployment ordering now requires disposable acceptance before Dev inspection/rollout. AUTH-03 remains **BLOCKED — ACCESS METHOD**; deployment is unauthorized.
- **SUPERSEDED NEXT GATE:** PF-SUP-2026-10-25-12 completed the scoped independent review of these runner corrections. BLK-016/017 external acceptance remains **NOT RUN — OWNER DEFERRED** under AUTH-02.

## Independent-review status

## ACC-01 — I3A local acceptance-harness authoring (2026-10-26)

- **OWNER-AUTHORIZED LOCAL AUTHORING:** the current owner message authorizes ACC-01 source/docs and pure/injected/static checks only.
- **AUTHORED:** fail-closed target/hash/command/fixture/evidence/cleanup preflight; side-effect-free orchestration/evidence modules; dormant PostgreSQL and concurrency executors; guarded fixture, ACL/RLS, state, concurrency and cleanup SQL; disabled-stage and dependency inventories.
- **EXECUTED LOCALLY:** injected synthetic test passed with zero real external calls; static contract test passed; focused strict harness compilation passed. Final exact results are in the ACC-01 report/manifest.
- **NOT RUN:** PostgreSQL, migrations, fixtures, ACL/RLS, concurrency, Auth/provider/browser, network, Docker/services/ports, credentials, cleanup, provisioning, activation or deployment.
- **NEXT GATE:** independent review of the ACC-01 manifest. AUTH-02 stays deferred; `REV-LIN-01` and every protected execution scope remain open.

## ACC-01 PF-SUP-2026-10-26-08 safety/coverage correction

- **OWNER-AUTHORIZED LOCAL CORRECTION:** explicit destination proof, unified narrow-command preflight, ownership-safe fixtures/cleanup, coordinator-proven concurrency, concrete SQL cases and sanitized evidence were locally corrected.
- **EXECUTED LOCAL ONLY:** synthetic test passed with 16 zero-executor rejection regressions; static test passed; focused strict compile passed; six PowerShell files parsed; PowerShell sanitizer synthetic test passed.
- **NOT RUN:** every PostgreSQL/SQL/fixture/ACL/RLS/concurrency/cancellation/cleanup/Auth/provider/browser/network/service/credential/deployment operation.
- **OPEN:** confirmed Auth continuation is unimplemented; provider feasibility is open; REV-LIN-01 and AUTH-02 remain deferred. Stop for independent review of the correction manifest.

## ACC-01 PF-SUP-2026-10-26-10 execution-fidelity correction

- **OWNER-AUTHORIZED LOCAL CORRECTION:** concurrency source now invokes actual I3 application RPCs for the pending-first and completed-first operation-collision orderings and observes the production operation advisory lock. No harness lock surrounds business operations.
- **FAIL-CLOSED COVERAGE:** durable recovery remains sequential because its recovery RPC exposes no observable application lock; reservation/revocation concurrency is blocked pending committed-fixture lifecycle review; consumption/revocation and confirmed continuation are Auth-scope blocked. No direct-row substitute is called accepted.
- **CORRECTED EVIDENCE:** PowerShell recursively sanitizes structured objects before serialization. PostgreSQL stdout, stderr/notices and exit status are separated; exactly one typed result envelope is required.
- **EXECUTED LOCAL ONLY:** synthetic/injected tests passed, including 16 zero-executor preflight rejections and malformed-stream regressions; static contracts passed; focused strict compilation passed; 8/8 PowerShell sources parsed; recursive sanitizer and process-framing PowerShell tests passed.
- **NOT RUN:** PostgreSQL parsing/execution, target proof, SQL, fixtures, RPCs, locks, ACL/RLS, Auth/provider/browser, credentials, cleanup, network, Docker, deployment or StoreFlow. AUTH-02 remains deferred and REV-LIN-01 remains undecided. Stop for independent review.

- Admin read-only data-honesty behavior: **EXECUTED ACCEPTANCE PASS** for the 18-assertion adapter test; auth 40/40 remains **HISTORICAL / REPORTED**. MVP-07 remains partial.
- Current dirty unified sale/sync work: **EXECUTED DEFECT REPRODUCTION**, 6/6 unsafe observations remain; **BLOCKED — APPROVAL** for implementation. SQL/concurrency effects are **NOT RUN**.
