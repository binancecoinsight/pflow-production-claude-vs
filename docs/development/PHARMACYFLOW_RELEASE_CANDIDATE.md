# PharmacyFlow local release-candidate preparation

Status: **RELEASE PREPARATION ONLY — NO GIT MUTATION AUTHORIZED**  
Baseline: `main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`  
Checkpoint: `PF-SUP-2026-10-23-06`

## Dependency-complete snapshot

`phase-b-acceptance/RELEASE_CANDIDATE_MANIFEST.sha256` is the exact proposed review snapshot. It is the union of the reviewed source manifest, acceptance artifact manifest and the release/deployment governance documents, with duplicates removed. Every entry is a repository-relative path plus SHA-256. The manifest excludes itself so it can be verified without recursion.

PF-SUP-2026-10-25-10 refreshes `phase-b-acceptance/M1_M4_REVIEW_MANIFEST.sha256` as a supplemental incremental-review overlay for the eight `docs/mvp` documents, four specification model/test/verifier files, the shared Edge cleanup module/test, all three Edge runners, and the status-v2 PostgREST runner/test. It is not silently merged into the prior release-candidate boundary and is not a staging list. Independent review must first validate the overlay; a later owner-approved release refresh may explicitly union accepted entries into a newly generated release-candidate manifest.

The source manifest covers runtime source, tests, migrations, Edge functions and local runners. The artifact manifest covers worksheets, guards, cleanup and evidence instructions. The release-candidate manifest is the proposed staging boundary; neither underlying manifest alone is a staging list.

Required untracked dependency chains are included together:

- durable checkout: `db.ts`, `types.ts`, `drafts.ts`, `scopeGuard.ts`, `pos/index.ts`, `protocol.ts`, `phaseB.test.ts`, POS lifecycle adapters and their consumers;
- status reconciliation: dispatcher/state/runtime, status-v2 migration source, gateway tests and verification package;
- capability containment: lifecycle, capability boundary, Customers/Suppliers/Cash/Devices/POS consumers and tests;
- acceptance: target guards, concurrency harness, Gate A/B SQL, Refund runners, Edge runners and guarded cleanup;
- test runtime: `package.json`, `scripts/typescript-loader.mjs` and `scripts/run-tests.ts`. No dependency was added.

This resolves the earlier staging contradiction: `drafts.ts`, `scopeGuard.ts`, `pos/index.ts`, `protocol.ts`, `phaseB.test.ts`, `gate-ab-cleanup.sql` and their consumers are required candidate entries and must not be excluded while dependent files are included.

## Mixed-file attribution

Several tracked files combine pre-checkpoint work with this candidate, notably `package.json`, `AuthenticatedShell.tsx`, `PosView.tsx`, offline persistence/dispatcher files, sales service/gateway files and Admin Support files. They require whole-file review against the manifest or an independently approved hunk map. No partial staging is proposed automatically.

The already-dirty `package-lock.json` contains optional-platform package churn unrelated to this batch. Read-only `npm.cmd ls --all --package-lock-only --ignore-scripts` reports missing nested `@tailwindcss/oxide-wasm32-wasi` dependencies and exits `ELSPROBLEMS`. No installation or lockfile regeneration is authorized, so the lockfile is excluded from this release candidate and preserved untouched. `package.json` adds no dependency; it changes only repository test commands to the already-installed loader. TypeScript and repository tests prove current installed dependency compatibility, but a clean-install gate remains blocked until the owner attributes or separately authorizes lockfile reconciliation.

## Explicit exclusions

- `tmp/.5cffffdf1eaded6d-00000000.node` and all temporary/native outputs;
- the existing dirty `package-lock.json` until its unrelated churn is separately reconciled;
- credentials, `.env` files, evidence output, browser profiles and machine state;
- every modified or untracked path absent from the release-candidate manifest;
- the legacy `apps/pharmacy-flow saas` tree unless a listed path is explicitly present;
- all StoreFlow resources.

## Proposed milestone commit

`feat(pharmacyflow): prepare secure onboarding, entitlement containment and Phase B acceptance`

This is a message proposal only. AUTH-04 prohibits staging, commit, amend, push, tag and history mutation. Independent GPT-6 review must compare this manifest with the previous checkpoint before the owner considers an exact staging authorization.
