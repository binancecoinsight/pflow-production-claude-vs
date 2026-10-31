# PharmacyFlow BLK-002 REV-LIN-01 local implementation correction

Date: 2026-10-26  
Baseline: PF-SUP-2026-10-26-14 / `main` / `f36985ef7d23aa414e473cb8e79777a429fee375`  
Design manifest: `437edf151d0b9b2d124bad2cd4cabffbbeb57a2d6798b2ea953634acf017f5d8`  
Classification: owner-authorized local source/test/document correction; PostgreSQL/Auth/provider/browser/concurrency not run

## Result

The inactive injected I3 gateway and the additive, unexecuted migration `20261026000033_owner_identity_recovery_linearization_v1.sql` now model the owner-approved REV-LIN-01 transaction-entry policy.

- Durable begin, new provider dispatch, provider exact-operation resolution, issue completion, recovery completion, recovery lookup and ambiguous-completion result lookup have distinct current-authority boundaries.
- A new dispatch requires `IDENTITY_ISSUE`. Restart or ambiguous provider resolution requires `IDENTITY_RECOVER`; issue-only authority cannot use recovery as a substitute for new creation authority, and recovery-only code has no create call.
- Every identity-phase authority call binds applicant digest and pharmacy context through the trusted injected boundary. Proposed SQL uses an empty-by-default authoritative scope registry in addition to active principal, exact credential version and capability checks. No scope row or identity is provisioned.
- The durable attempt stores original principal, original credential version and every normalized typed-command field. Recovery reconstructs and checks the original fingerprint from stored evidence and never substitutes the recovery actor.
- A different currently authorized recovery principal may resolve only the stored applicant/context binding. Operation identifiers do not bypass scope authorization.
- Completion persists the canonical operation/result, changes the attempt state and appends required execution audit in one SQL transaction. An audit error therefore rolls the transaction back. The injected model separately demonstrates no committed operation or false successful replay after audit failure.
- Original operation, fingerprint, request, applicant, context and provider-operation bindings remain immutable. Execution/recovery principal and credential version are append-only audit attributes.
- Historical attempts missing original credential version or complete typed-command provenance receive `LEGACY_ISSUANCE_PROVENANCE_INCOMPLETE`; the migration performs no invented backfill.

## Authoritative phase boundaries

| Phase | Capability at transaction entry | Authoritative evidence/effect |
|---|---|---|
| Begin | `IDENTITY_ISSUE` plus applicant/context scope | Validate reservation and atomically persist complete original provenance before provider work. |
| New provider dispatch | fresh `IDENTITY_ISSUE` plus scope | Reload authoritative stored command and append dispatch-authorization audit before provider inspect/create. |
| Restart/ambiguous provider resolution | fresh `IDENTITY_RECOVER` plus scope | Reload the same pending attempt and permit exact provider-operation lookup only. |
| Normal completion | fresh `IDENTITY_ISSUE` plus scope | Verify stored provenance/provider binding; atomically correlate, persist canonical result and audit. |
| Recovery completion | fresh `IDENTITY_RECOVER` plus scope | Preserve original authorship and append the current recovery actor/version separately. |
| Completed recovery replay | fresh `IDENTITY_RECOVER` plus scope | Return immutable stored result with no provider create or resend. |
| Ambiguous database-result lookup | fresh phase capability plus scope | Return only a proven completed result; absence remains an error. |

A revocation before any row above denies that phase. A revocation after its successful authoritative entry does not retroactively abort that bounded transaction, but it denies every later phase. A pending attempt is never continuing authorization.

## Additive SQL and ACL disposition

Migration `000033` is source only and was never executed. It:

1. adds the fail-closed `owner_gateway_authority_scopes` registry without provisioning rows;
2. adds nullable provenance columns so pre-000033 rows remain distinguishable and fail closed;
3. adds forced-RLS, append-only `owner_identity_execution_audit` evidence;
4. authors v4 begin/completion/recovery and narrow dispatch/resolution/result-lookup RPCs;
5. assigns every SECURITY DEFINER function to `pharmacyflow_owner_eligibility_issuer`;
6. revokes every superseded identity RPC and every new RPC from `PUBLIC`, `anon`, `authenticated`, `service_role` and both executors before granting new public RPCs only to `pharmacyflow_owner_gateway_executor`.

Migrations `000027` through `000032` were not edited. No database syntax, ownership, effective ACL, forced-RLS, transaction rollback, lock or concurrency assertion has been executed against PostgreSQL.

## Local verification

The final manifest records the exact source snapshot and results. Permitted checks executed with existing dependencies:

| Check | Result | Evidence boundary |
|---|---:|---|
| Strict focused I3 compilation, `tsc -p tsconfig.i3.json --noEmit` | PASS | Local compiler only |
| Root application compilation, `tsc -p tsconfig.json --noEmit` | PASS | Root include set; no runtime execution |
| Gateway injected model | 50 passed | In-memory sequential authority/repository/provider model |
| Operator injected model | 25 passed | Existing in-memory sequential model |
| I3 static source/ACL contract | 135 passed | Source text and sealed hashes only |
| Scoped `git diff --check` | PASS | Whitespace validation only |
| Manifest verification | all entries matched | Local SHA-256 only |

The gateway regressions cover fresh phase authorization, revocation before dispatch and completion, accepted in-transaction revocation, restart, issue-only/recovery-only separation, response loss, no-create recovery, rotated/stale/revoked credentials, different recovery principal, scope denial, original-identity preservation, legacy provenance failure, exact immutable replay and audit rollback.

## Not run / remaining gates

No database or SQL was parsed or executed. No migration, fixture, RPC, ACL/RLS, trigger, rollback, lock or concurrency behavior was verified in PostgreSQL. No target, credential, Auth/provider/browser, network, Docker, service/port, provisioning, runtime adapter, signup, activation, deployment, environment destruction, Git mutation or StoreFlow access occurred.

The new scope registry is intentionally empty and runtime identity mapping remains absent. AUTH-02 remains deferred. Technical source/synthetic completion is submitted for independent review; protected acceptance and rollout require later, exact owner authorization.

## PF-SUP-2026-10-26-15 superseding security correction

Independent review found that the 000033 shared SQL helpers allowed a second applicant/context-scoped `IDENTITY_ISSUE` principal to enter dispatch, completion and result-lookup routes for another principal's attempt, and that the injected scope mock treated an absent scope set as unrestricted. The owner authorized a bounded correction. Inactive model source now denies missing scope grants by default and enforces original-principal equality on issue routes; recovery routes remain separately scoped and cross-principal. Forward-only, unexecuted migration `000034` applies the same checks at the SQL boundary without altering 000033.

This addendum preserves the earlier report as historical evidence. Exact PF-SUP-15 changes, verification and limitations are recorded in `PHARMACYFLOW_BLK002_REV_LIN_01_SECURITY_CORRECTION_PF-SUP-2026-10-26-15.md` and its new manifest.
