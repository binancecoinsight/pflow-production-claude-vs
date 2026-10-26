# PharmacyFlow milestone staging proposal

Status: **PROPOSAL ONLY — NO GIT MUTATION AUTHORIZED**  
Baseline: `main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`

## Review snapshot

Review APP-01–APP-07 local policy integration together with the preserved Phase B acceptance bundle. The authoritative hashes are in `phase-b-acceptance/SOURCE_MANIFEST.sha256` and `ARTIFACT_MANIFEST.sha256`.

New policy source/tests:

- `src/lib/auth/onboarding.ts`
- `src/lib/auth/onboarding.test.ts`
- `src/lib/subscription/lifecycle.ts`
- `src/lib/subscription/lifecycle.test.ts`
- `src/lib/subscription/capabilityBoundary.ts`
- `src/lib/subscription/capabilityBoundary.test.ts`
- `src/components/StaffInvitationForm.tsx`

Policy integration files:

- `src/components/AuthScreen.tsx`
- `src/components/NoMembershipScreen.tsx`
- `src/components/AuthenticatedShell.tsx`
- `src/components/pos/PosView.tsx`
- `src/components/inventory/InventoryView.tsx`
- `src/components/sales/SalesView.tsx`
- `src/components/sales/SaleDetailModal.tsx`
- `src/components/customers/CustomersView.tsx`
- `src/components/suppliers/SuppliersView.tsx`
- `src/components/suppliers/SupplierModal.tsx`
- `src/components/cash/CashReconciliationView.tsx`
- `src/components/devices/DeviceManagementView.tsx`
- `src/lib/pos/drafts.ts`
- `src/lib/pos/scopeGuard.ts`
- `src/lib/pos/index.ts`
- `src/lib/offline/protocol.ts`
- `src/lib/offline/phaseB.test.ts`
- `src/contexts/AuthContext.tsx`
- `src/types/auth.ts`
- `apps/pharmacy-flow-admin/components/Dashboard.tsx`
- `apps/pharmacy-flow-admin/lib/admin-data-readiness.ts`
- `apps/pharmacy-flow-admin/lib/dashboard-data-boundary.test.mjs`
- `scripts/run-tests.ts`

Governance and acceptance artifacts:

- `docs/development/PHARMACYFLOW_DECISIONS.md`
- `docs/development/PHARMACYFLOW_ROADMAP.md`
- `docs/development/PHARMACYFLOW_PROGRESS.md`
- `docs/development/PHARMACYFLOW_OWNER_POLICY_IMPLEMENTATION.md`
- `docs/development/PHARMACYFLOW_ISOLATED_ACCEPTANCE_PLAN.md`
- `docs/development/PHARMACYFLOW_DEV_READ_ONLY_INSPECTION.md`
- `docs/development/PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md`
- `docs/development/PHARMACYFLOW_FORWARD_CONTRACT_DESIGNS.md`
- `docs/development/PHARMACYFLOW_RELEASE_CANDIDATE.md`
- `docs/development/PHARMACYFLOW_DEPLOYMENT_RECOVERY_PLAN.md`
- `docs/development/phase-b-acceptance/AUTHORIZATION_REQUEST.md`
- `docs/development/phase-b-acceptance/SOURCE_MANIFEST.sha256`
- `docs/development/phase-b-acceptance/ARTIFACT_MANIFEST.sha256`
- `docs/development/phase-b-acceptance/RELEASE_CANDIDATE_MANIFEST.sha256`
- `scripts/phase-b-acceptance/gate-b-concurrency.ps1`
- `scripts/phase-b-acceptance/gate-ab-cleanup.sql`
- `scripts/acceptance/target-guard.mjs`
- `scripts/acceptance/target-guard.ps1`
- `scripts/acceptance/target-guard.test.mjs`
- `scripts/acceptance/concurrency-harness.ps1`
- `scripts/acceptance/status-v2-postgrest.mjs`
- `scripts/acceptance/status-v2-postgrest.test.mjs`
- `scripts/run-refund-v2-local.ps1`
- `scripts/run-refund-v2-concurrency.ps1`
- `scripts/run-edge001-disposable.mjs`
- `scripts/run-edge002-disposable.mjs`
- `scripts/run-edge003-disposable.mjs`

## Mixed-file warning

Several tracked files above already contained relevant prior Phase B/Admin/test-runner work. Independent review must compare their complete current content and use selective paths/hunks only after confirming the intended combined milestone. Do not use `git add .` or `git add -A`.

The durable checkout/barrel/protocol/Phase B test and cleanup paths listed above are dependencies of included consumers and are not exclusions. The dependency-complete proposed staging boundary is `phase-b-acceptance/RELEASE_CANDIDATE_MANIFEST.sha256`; the source and artifact manifests are evidence subsets.

PF-SUP-2026-10-25-10 reconciliation: `phase-b-acceptance/M1_M4_REVIEW_MANIFEST.sha256` is a supplemental review overlay only. It now covers the eight MVP documents, four specification model/test/verifier files, the Edge cleanup module/test, all three Edge runners, and the status-v2 PostgREST runner/test. These paths are not included in the older release-candidate manifest merely by being hashed. After independent review, the staging proposal and release-candidate manifest must be deliberately regenerated before any owner staging request. AUTH-04 continues to prohibit Git mutation.

`package-lock.json` is deliberately excluded: this batch adds no dependency, and read-only dependency inspection reports unrelated missing nested optional-platform entries. Do not stage or regenerate it without separate attribution and authorization.

## Explicit exclusions

Exclude every unlisted modified/untracked path, temporary native files, credentials, evidence directories, browser profiles and environment state. Do not stage generated test output. StoreFlow is permanently excluded.

## Release gate

1. GPT-6 performs an incremental review against the two manifests and the previous PF-SUP checkpoint.
2. Findings are corrected or explicitly dispositioned.
3. The owner approves an exact staging path/hunk list.
4. Only then may the reviewed snapshot be staged; a separate owner approval is required before commit, and push remains separate.
