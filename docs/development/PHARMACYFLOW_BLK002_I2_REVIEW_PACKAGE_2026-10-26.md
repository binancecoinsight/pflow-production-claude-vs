# BLK-002-I2 incremental independent-review package

Date: 2026-10-26  
Requested reviewer: GPT-6 Work  
Review scope: BLK-002-I2 increment only; do not perform a broad repository audit  
Historical baseline checkpoint: `PF-SUP-2026-10-25-18`

## Baseline and preservation

- Branch: `main`.
- HEAD before and after local work: `d145324be6d5f1c787bceab6baf27ca0ce375eeb`.
- Entry status was already dirty: 47 tracked modifications and 92 untracked entries. No reset, clean, stash, stage, commit, checkout, amend, push or tag occurred.
- Current status after adding four I2 files is 47 tracked modifications and 96 untracked entries. All non-I2 application/source changes were preserved and intentionally untouched.
- Migration `000028` SHA-256 remains `cb9e0ceb134d430e2d7fb8ac3812d3f243eb2660e3e655a3a8608c50a54c4445`.
- Migration `000029` SHA-256 remains `3973ba51139a4ccfef03aca80e9231b0465738937de0af97f60bd2e425bcfb9e`.

## Exact I2 file manifest

New files:

1. `docs/development/PHARMACYFLOW_BLK002_I2_GATEWAY_PROVIDER_SECURITY_DESIGN_2026-10-26.md`
2. `docs/development/PHARMACYFLOW_BLK002_I2_REVIEW_PACKAGE_2026-10-26.md`
3. `scripts/specification/blk002-i2-security-contract.ts`
4. `scripts/specification/blk002-i2-security-contract.test.ts`

Pre-existing untracked canonical files updated by inserting one I2 section (their unrelated content is preserved):

5. `docs/development/PHARMACYFLOW_DECISIONS.md`
6. `docs/development/PHARMACYFLOW_PROGRESS.md`
7. `docs/development/PHARMACYFLOW_ROADMAP.md`
8. `docs/mvp/PHARMACYFLOW_BLOCKER_REGISTER.md`
9. `docs/mvp/PHARMACYFLOW_MILESTONE_REPORT.md`
10. `docs/mvp/PHARMACYFLOW_MVP_ROADMAP.md`
11. `docs/mvp/PHARMACYFLOW_OWNER_APPROVALS.md`
12. `docs/mvp/PHARMACYFLOW_TEST_EVIDENCE.md`

Because files 5–12 were already untracked at entry, Git cannot produce a baseline-relative patch for only the inserted section. Review their top I2 section and the BLK-002 row in the blocker register. No tracked file was changed by I2.

## Diff summary

- Added one consolidated design/report covering the current contract map, trust boundary, access-mechanism matrix, idempotency/recovery, ADM-01, REV-01, threat model, proposed I3 scope, acceptance matrix and safety attestation.
- Added one pure injected specification and focused test. They contain no runtime entrypoint, environment lookup, database/provider/network/browser adapter or credential.
- Reconciled the two approved policies and I2 status across the existing owner decision, blocker, roadmap, evidence, milestone, decision and progress registers.
- Did not edit application runtime, Edge runtime entrypoints, grants, SQL migrations, package scripts or dependencies.

## Contracts inspected

- `supabase/functions/owner-eligibility-issuer/index.ts` and its injected tests.
- `src/lib/auth/onboarding.ts` and relevant onboarding tests.
- `supabase/contracts/owner_onboarding_v1.test.ts`.
- `supabase/contracts/owner_eligibility_issuer_v1.test.ts`.
- migrations `20261025000027_owner_onboarding_v1.sql`, `000028_owner_eligibility_issuer_v1.sql` and `000029_owner_eligibility_recovery_v1.sql`.
- canonical owner approvals, blocker, roadmap, test-evidence and milestone registers.
- I1 issuer design/correction evidence and development decision/progress/roadmap records.

Key reconciliation: exact existing reservations in `000029` resolve before current admission checks, so revoking admission blocks a new reservation without implicitly invalidating an existing eligibility. Eligibility revocation and consumption both target the eligibility row, but actual transaction serialization remains unverified. Operator actor/permission/reason audit and prospective pharmacy context are not present in the current schema.

## Alternatives and recommendation

Considered: short-lived asymmetric workload identity, mTLS workload identity, delegated applicant token, static narrow secret, Supabase `service_role`, direct issuer-owner database login, existing platform-admin and pharmacy-user identities.

Recommendation: a PharmacyFlow-controlled gateway using a dedicated, revocable, short-lived workload identity mapped only to a narrow gateway façade. Applicant-authenticated recovery/consumption and operator admission/revocation use separate identity and permission planes. Delegated applicant identity is a required companion path, not a substitute gateway identity. `service_role`, direct owner login, pharmacy users and inferred generic-admin authority are rejected.

Tradeoff: this gives the smallest blast radius and strongest attribution but depends on unverified hosting/provider support. A narrow static secret is only a fallback subject to separate security review. No credential was created or assumed to exist.

## Fresh safe test evidence

| Command | Actual result |
|---|---:|
| `node --loader ./scripts/typescript-loader.mjs scripts/specification/blk002-i2-security-contract.test.ts` | 28 passed |
| `node --loader ./scripts/typescript-loader.mjs supabase/functions/owner-eligibility-issuer/index.test.ts` | 39 passed |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_eligibility_issuer_v1.test.ts` | 53 passed |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_onboarding_v1.test.ts` | 28 passed |
| `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict scripts/specification/blk002-i2-security-contract.ts scripts/specification/blk002-i2-security-contract.test.ts` | PASS |

The first compiler attempt omitted TypeScript 7's `--ignoreConfig` requirement and returned `TS5112`; the corrected command passed. All tests are pure/injected/static/synchronous. They are not PostgreSQL, RLS, real concurrency, Auth provider, gateway, network, browser or deployment evidence.

## Findings

### P0

No new P0 source defect was demonstrated in the inspected local contracts. The following P0-class controls remain unaccepted and therefore block release: gateway/applicant identity forgery resistance, cross-tenant isolation, operator impersonation resistance, leaked-credential containment, double-issuance/concurrent-consumption prevention and immutable-history enforcement.

### P1

1. **Exact provider recovery unverified:** production safety is blocked until an actual provider proves non-client-writable operation correlation and exact-operation recovery after ambiguous create.
2. **Gateway workload authentication unverified:** the recommended principal/audience/rotation design requires platform evidence; broad `service_role` is not an allowed fallback.
3. **ADM-01 implementation absent:** current admissions do not record operator identity, exact permission, context, reason or immutable decision operation.
4. **REV-01 runtime/race evidence absent:** the intended semantics are representable, but real PostgreSQL lock/RLS/grant behavior has not run.
5. **Partial-commit recovery unverified:** without exact provider proof an ambiguous outcome must remain recovery-pending and cannot be retried as a new create.

### P2

- Retention, rate limits, anomaly thresholds and dual-control triggers need owner/security decisions.
- Audit data minimization and long-term export/retention need a reviewed operating policy.

## Unverified assumptions

- The execution platform can verify a short-lived asymmetric workload assertion or equivalent mTLS identity and map it to a narrow façade.
- The provider can persist and query exact non-client-writable operation correlation.
- Effective database ownership and privileges can prevent both gateway/operator cross-use and table-owner/RLS bypass.
- The proposed lock order produces the modeled race winners under real PostgreSQL concurrency.
- Auth confirmation and trusted app metadata are authoritative and cannot be client-authored.

## Exact next protected authorization proposal

Request owner approval for **BLK-002-I3 local authoring only**, after this incremental review:

1. add injected `owner-eligibility-gateway` and `platform-admission-operator` façade source/tests;
2. add one static contract test;
3. author, but do not execute, forward-only migration `20261026000030_owner_gateway_operator_contract_v1.sql`;
4. add append-only admission, eligibility-revocation and security-operation evidence; stable prospective pharmacy context; separate NOLOGIN/NOBYPASSRLS façade roles; narrow commands/grants; and explicit lock order;
5. preserve migrations `000028`/`000029`, sealed onboarding/financial contracts and all consumed evidence;
6. run only inspected local type/static/injected tests and submit a new incremental review package.

This approval must not include credential provisioning, provider/network calls, database connection/query/migration, grants on an environment, Auth acceptance, browser acceptance, gateway enablement, onboarding/admission activation, Git mutation or deployment. Those remain distinct later authorization gates.

## Independent-review request

Please verify only this 12-file I2 manifest and its direct contract dependencies. Confirm or challenge:

- the **CONDITIONAL** I2 disposition;
- the workload-principal/narrow-façade choice and rejection of `service_role`;
- the source contract map;
- ADM-01 authority separation and audit requirements;
- REV-01 transitions and both race orderings;
- idempotency/recovery invariants and provider guarantees;
- P0/P1/P2 classification;
- the minimum I3 forward-only implementation scope.

Do not treat this request as authority for external verification or a full-repository audit.

## Safety confirmation

No database query/migration, Auth/provider/network call, Docker/Supabase/service/port operation, browser/IndexedDB integration, credential access, privileged grant, identity provisioning, admission/onboarding activation, Git mutation, deployment, cleanup or destructive action occurred. StoreFlow remained untouched and uninspected.
