# BLK-002-I2 corrected specification review package

Correction checkpoint: **PF-SUP-2026-10-26-01**  
Date: 2026-10-26  
Branch / HEAD: `main` / `d145324be6d5f1c787bceab6baf27ca0ce375eeb`  
Disposition: **LOCAL SPECIFICATION CORRECTED — INDEPENDENT REVIEW REQUIRED — I3 NOT STARTED**

## 1. Authorization and provenance

The original owner-supplied directive titled `PHARMACYFLOW — BLK-002-I2 GATEWAY/PROVIDER SECURITY DESIGN AND FEASIBILITY`, received in the current 2026-10-26 work session, expressly records owner approval of BLK-002-I2 Option A, ADM-01 Option A and REV-01 Option A for local design, feasibility and injected tests only. The original message/attachment is not tracked in the repository. Repository ledgers are secondary evidence; the reviewer must compare them with the original work transcript. No I3, gateway, role/grant, migration, provider, database, activation or deployment authority is inferred.

PF-SUP-2026-10-26-01 authorizes only this bounded specification correction and requires stopping for independent review.

## 2. Baseline and preservation

- Start state: 47 tracked modifications and 96 untracked entries, all preserved.
- No tracked file was changed by this correction batch; the touched ledgers were already untracked work.
- Migrations `000028` and `000029` remain unchanged and unexecuted.
- Historical manifests remain present and were not edited.
- The new manifest captures the corrected snapshot. Hashes for shared append-only ledgers differ from older manifests because those ledgers have advanced; this does not alter or invalidate the historical snapshot files.

## 3. Corrected defects

| Reproduced defect | Correction | Injected evidence |
|---|---|---|
| Effect and operation result could commit before required audit append | Work occurs on a cloned state; audit preparation must succeed; effect, durable result and audit then become visible through one state-root swap | Injected audit failure leaves no admission, operation or audit; recovery returns `AUTHORITATIVE_RESULT_NOT_FOUND`; retry applies once |
| Recovery trusted `binding.actorId` and skipped current authorization | `actorId` was removed from caller binding; an injected trusted boundary derives stable actor, kind, credential version and current action/mode authority for execute and recover | Revoked operator, stale/revoked gateway, missing recovery capability, cross-subject applicant, cross-context and action mismatch are rejected |
| Fingerprint trusted caller `payloadHash` and omitted arguments | SHA-256 is computed from an explicit typed-command projection plus stable actor ID; caller hashes/untyped extras are ignored | Changed target, predecessor and canonical result conflict under the same operation ID even when a claimed hash is unchanged; exact replay succeeds |
| Rotation and mutable replay evidence were unsafe | Credential version is audited but excluded from operation identity; stable actor ID remains bound; results are deep-copied and deep-frozen on commit and return | Current rotated gateway recovers; stale/revoked gateway cannot; nested mutation throws and later recovery returns original evidence |
| Duplicate identifiers could overwrite maps | Admission, eligibility and provider-operation IDs receive explicit uniqueness checks | Duplicate admission/eligibility/provider operation and replacement self-reuse are rejected |

The model contains no production adapter or persistence boundary. Its atomic state-root swap is a specification mechanism, not database evidence.

## 4. Authorization/recovery contract

Current authority is required before any result lookup:

- admission approve/replace/revoke recovery requires the matching current operator permission;
- eligibility-revocation recovery requires current `ELIGIBILITY_REVOKE` permission;
- reservation recovery requires current `ELIGIBILITY_RESERVE` gateway capability;
- identity-issuance recovery requires current `IDENTITY_RECOVER` capability, distinct from execution's `IDENTITY_ISSUE`;
- consumed-result recovery requires a current applicant credential whose trusted subject equals the immutable applicant;
- every recovery must match the stored action, stable actor, applicant/context and full typed-command fingerprint.

Credential rotation does not change operation identity when the trusted boundary derives the same stable actor. It does not grandfather authorization: stale, revoked or underprivileged credentials fail before result disclosure.

## 5. Canonical fingerprint contract

The fingerprint covers contract version, action, stable actor ID, applicant, prospective pharmacy context and the action's complete typed body:

- admission/result target IDs;
- predecessor and replacement IDs;
- admission/eligibility references;
- provider-operation ID;
- decision evidence or revocation reason;
- canonical consumption result, including nested effect-bearing values.

Object keys are deterministically ordered before SHA-256. Non-finite/non-canonical values fail. Credential version and untyped fields such as a caller-provided hash are excluded. New operation IDs remain subject to domain uniqueness and terminal-state constraints.

## 6. Existing versus proposed lock behavior

Static source inspection confirms only:

1. `000029` reservation takes advisory locks in request-ID then email-digest order, resolves an exact request row `FOR UPDATE`, reads the admission `FOR SHARE` for new work, locks a conflicting open eligibility, and locks a replacement predecessor when supplied.
2. `000028` eligibility revocation locks the target eligibility row `FOR UPDATE`.
3. The corrected OWNER RPC locks eligibility then the subject/request onboarding row before tenant effects and `CONSUMED` update.
4. Existing migrations do not implement audited admission revocation, an operation/audit ledger, or operator/gateway façades.

Proposed I3 order is operation identity → applicant/email/context serialization → admission → eligibility rows in deterministic ID order → onboarding request → tenant effects and immutable result/audit. This proposal must be reviewed against the exact `000029` replacement order before any SQL authoring. The 44-test I2 model evaluates sequential orderings only. It is not PostgreSQL concurrency, deadlock, RLS or effective-privilege proof.

## 7. Fresh local evidence

All entrypoints were inspected and are pure/injected/static. Actual results:

| Command | Result |
|---|---:|
| `node --loader ./scripts/typescript-loader.mjs scripts/specification/blk002-i2-security-contract.test.ts` | **44 passed** |
| `node --loader ./scripts/typescript-loader.mjs supabase/functions/owner-eligibility-issuer/index.test.ts` | **39 passed** |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_eligibility_issuer_v1.test.ts` | **53 passed**; PostgreSQL concurrency remains unexecuted |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_onboarding_v1.test.ts` | **28 passed**; SQL concurrency remains unexecuted |
| `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --types node --strict scripts/specification/blk002-i2-security-contract.ts scripts/specification/blk002-i2-security-contract.test.ts` | **PASS** |

The first post-correction typecheck identified two test-only excess-property errors in the untrusted-hash assertions. The assertions were expressed through inferred variables, preserving runtime intent, and the corrected command passed. No dependency was installed.

## 8. Evidence limitations and findings

- No new P0 was demonstrated in the corrected local model.
- P1 remains: exact provider-operation recovery is unverified.
- P1 remains: workload-principal authentication and rotation are unverified outside the injected boundary.
- P1 remains: database-atomic effect/result/audit, ADM-01 authority, REV-01 races, RLS, grants and real concurrency are unverified.
- P1 remains: the proposed I3 lock order has not yet been implemented or checked by PostgreSQL lock-overlap/deadlock tests.
- P2 remains: audit retention/minimization, rate limits, anomaly thresholds and exceptional dual control need later policy/operational review.

No PostgreSQL, Auth/provider, gateway, network, Docker, service/port, credential, browser-storage or deployment acceptance is claimed.

## 9. Exact correction manifest

`docs/development/BLK002_I2_CORRECTION_MANIFEST_PF-SUP-2026-10-26-01.sha256` is the authoritative hash list for this correction snapshot. It includes the model/test, corrected design/review documents, touched canonical ledgers and unchanged migrations `000028`/`000029` as direct dependencies. The manifest does not include itself.

## 10. Precise proposed I3 authorization — not yet approved

After a successful independent review, the owner may separately authorize **BLK-002-I3 local authoring only**:

1. author injected `owner-eligibility-gateway` and `platform-admission-operator` façade contracts and focused tests;
2. author static privilege/contract checks;
3. author, but do not execute, one forward-only `20261026000030_owner_gateway_operator_contract_v1.sql` proposal;
4. add append-only security operations, admission decisions and eligibility-revocation decisions with stable actor/applicant/context/typed-command/result bindings;
5. add the reviewed prospective pharmacy-context representation;
6. propose separate NOLOGIN/NOBYPASSRLS façade roles and narrow commands/grants without provisioning them;
7. reconcile the final lock hierarchy with `000028`/`000029`, preserving both migrations byte-for-byte;
8. run only inspected local injected/static/type checks and produce another incremental review package.

That authorization must expressly exclude migration/database execution, environment grants, identity or credential provisioning, provider/network/Auth calls, gateway/signup/admission activation, browser acceptance, Git mutation, deployment, cleanup and StoreFlow.

## 11. Independent review request

Review only the corrected I2 manifest and its direct dependencies. Verify atomic failure behavior, trusted recovery authorization, action mappings, typed-command projection completeness, rotation semantics, deep immutability, duplicate-ID handling, current/proposed lock reconciliation, authorization provenance and exact test results. Confirm the manifest hashes and that older manifests remain untouched. Do not begin or approve I3 implicitly.

## 12. Safety attestation

No database, migration, Auth/provider, network, Docker, service/port, credential, browser-storage, installation, Git mutation, deployment, activation, cleanup or destructive operation was performed. StoreFlow remained untouched and uninspected. No production adapter, gateway grant, signup path, consumed-history rewrite or I3 artifact was created.
