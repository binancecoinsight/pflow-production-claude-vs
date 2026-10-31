# PharmacyFlow BLK-002 REV-LIN-01 policy reconciliation

Date: 2026-10-26  
Baseline: PF-SUP-2026-10-26-13 / `main` / `f36985ef7d23aa414e473cb8e79777a429fee375`  
Classification: design/source inspection only; not implemented or externally verified

## Owner-approved policy

REV-LIN-01 now selects **transaction-entry linearization**. Every independently invoked privileged phase must establish current trusted principal identity, active status, exact credential version and action-specific permission at its own authoritative entry. A phase accepted there may finish its bounded transaction despite later credential revocation. Revocation denies later phases and calls; it does not erase a committed result.

A durable attempt, queue item or request is correlation/state evidence, not continuing authority. Already-dispatched provider effects retain the original operation, fingerprint and provider-operation ID. Unknown or lost responses remain pending for exact resolution and never authorize blind creation. A revoked credential cannot recover or replay; another currently authorized `IDENTITY_RECOVER` principal may resolve the original operation without becoming its original actor. Recovery-only authority cannot create a provider identity.

This policy addresses authority-credential revocation. Admission revocation remains the separate applicant-admission policy reviewed at PF-SUP-2026-10-26-13.

## Exact phase boundaries

| Phase | Authoritative entry/linearization point | Revocation outcome | Current source disposition |
|---|---|---|---|
| Gateway reservation execute | Successful `private_i3_require_gateway_v1('ELIGIBILITY_RESERVE')` inside the reservation RPC transaction, before operation/applicant locks or effects | Before entry: deny. After entry: bounded reservation transaction may commit. | Aligned in migration `000031:232-239`; injected façade checks at `owner-eligibility-gateway/index.ts:106-110`. |
| Gateway reservation result recovery | Successful current `ELIGIBILITY_RESERVE` authorization before exact result lookup | Revoked caller receives no replay. No new reservation may be created by recovery. | Aligned for current-authority denial at façade lines `112-117` and generic SQL recovery `000030:551-584`. |
| Admission approve/replace/revoke execute | Successful action-derived `private_i3_require_operator_v1(permission)` inside the admission RPC transaction | Before entry: deny. After entry: that bounded decision transaction may commit. | Aligned in migration `000031:241-250`; façade lines `101-111`. |
| Admission decision recovery | Successful current action-specific operator authorization before exact lookup | Revoked or wrong-action operator receives no result. Recovery performs no decision mutation. | Aligned in façade lines `114-125`; runtime/database adapter remains absent. |
| Eligibility revocation execute | Successful `private_i3_require_operator_v1('ELIGIBILITY_REVOKE')` inside the revocation RPC transaction | Before entry: deny. After entry: bounded revocation transaction may commit. | Aligned in migration `000031:252-287`; façade lines `128-136`. |
| Eligibility revocation recovery | Successful current `ELIGIBILITY_REVOKE` authorization before exact lookup | Revoked operator receives no replay. | Aligned in façade lines `139-149`; runtime/database adapter remains absent. |
| Identity issuance begin | Successful `private_i3_require_gateway_v1('IDENTITY_ISSUE')` inside `rpc_gateway_begin_owner_identity_v3`, before operation lock, reservation validation and durable `PROVIDER_PENDING` insert | Before entry: deny. After entry: begin transaction may commit. Its pending row grants no later authority. | Aligned at migration `000032:120-166`; façade begins at lines `142-147`. |
| Provider dispatch | A fresh successful current `IDENTITY_ISSUE` check immediately before the first provider inspect/create/exact-status call, after durable begin | Revoked before dispatch: leave original attempt pending and make zero provider calls. Revoked after dispatch entry: the bounded dispatch/status-resolution phase may finish, retaining original correlation. | **Mismatch:** façade performs only the earlier check at line `144`, then provider access at lines `152-163` without a fresh dispatch check. |
| Normal issue completion | Successful current `IDENTITY_ISSUE` check inside the completion transaction before attempt lock/correlation/result/audit | Revoked before completion: do not finalize; preserve pending correlated evidence. Revoked after entry: completion transaction may commit. | SQL aligned at migration `000032:169-203`, but the injected façade does not express a separate authority boundary around `completeIssuanceAtomic` at lines `120-128`. |
| Recovery invocation / completed replay | Successful current `IDENTITY_RECOVER` check before attempt/result access | Revoked credential receives neither pending details nor canonical result. | Current check exists at façade lines `172-178` and migration `000032:218-232`. **Mismatch:** fingerprint and attempt equality use the recovery actor rather than immutable original actor, preventing a different authorized recovery principal. |
| Provider exact-operation resolution during recovery | A fresh successful current `IDENTITY_RECOVER` check immediately before `provider.recoverExact`; never `createUnconfirmedOwner` | Revoked before resolution: no provider access. Revoked after entry: bounded exact lookup may finish; `UNKNOWN`/absence remains pending and never triggers create. | Recovery path has no create call, but **mismatch:** only the earlier outer check at line `174` precedes repository work and provider lookup at line `180`; no explicit resolution-phase recheck exists. |
| Recovery completion | Successful current `IDENTITY_RECOVER` check inside the recovery-completion transaction, while verifying the immutable original attempt/command/provider binding | Revoked before entry: do not finalize. Revoked after entry: bounded completion transaction may commit. Recovery actor is audited separately; original operation identity remains unchanged. | Capability check exists at migration `000032:169-215`. **Mismatch:** lines `179-185` recompute/compare the command fingerprint with `actor.principal_id`, and lines `198-199` write the recovery actor as the operation principal. Cross-principal authorized recovery cannot preserve original identity. |
| Restart after response loss | New recovery invocation; current `IDENTITY_RECOVER` entry checks apply again | A prior accepted begin/dispatch is not authorization. Exact provider correlation is reused; no resend/create. | Conservative pending/error behavior exists, but alternate-principal recovery is blocked by the identity mismatch above. |

## Timing dispositions

- **Revocation before a phase entry:** fail closed before that phase's effect or result disclosure.
- **Revocation during a database transaction after its authority check:** the transaction may commit; its result remains canonical and immutable.
- **Revocation before delayed provider dispatch:** dispatch must not occur. The durable attempt stays `PROVIDER_PENDING` for a later authorized recovery principal.
- **Revocation after provider dispatch:** never resend or infer absence. Preserve operation/provider correlation; normal completion may be denied and later recovery resolves the same effect.
- **Response loss:** exact provider-operation lookup only. `UNKNOWN`, timeout, malformed evidence and unproven absence remain pending.
- **Restart/recovery:** reauthorize `IDENTITY_RECOVER`; load immutable original bindings; exact lookup only; separately authorize recovery completion.

## Demonstrated mismatches

1. **Dispatch reauthorization is absent.** `issueOwnerIdentity` authorizes before durable begin, but the begin transaction ends before provider inspection/create/status work. The accepted pending attempt is therefore being used as implicit continuing authority across a phase boundary.
2. **Provider-resolution reauthorization is absent.** `recoverIssuedIdentity` authorizes once, performs database lookups, then invokes provider exact recovery without a fresh resolution-phase check.
3. **Alternate authorized recovery cannot preserve operation identity.** SQL and TypeScript construct the identity/fingerprint from the recovery actor and require equality with the original attempt principal. The approved policy requires current recovery authority to be separate from immutable original operation authorship.
4. **Recovery audit identity is conflated with original operation identity.** Recovery completion currently writes `actor.principal_id` and its credential version into the completed operation. A different recovery actor would either conflict or replace authorship; neither matches the approved policy.

These are source/design findings. No runtime identity mapping exists, and no database/provider behavior was executed.

## Smallest proposed implementation scope — requires separate owner approval

One cohesive **BLK-002-I3 REV-LIN-01 implementation correction** should be authorized separately:

1. Update the inactive gateway façade/contracts so issue dispatch, issue completion, recovery provider resolution and recovery completion each invoke the trusted authority boundary at their own phase entry. Dispatch uses `IDENTITY_ISSUE`; resolution/recovery completion use `IDENTITY_RECOVER`.
2. Separate immutable `OriginalOperationIdentity` from current `RecoveryActor`. Recompute/verify the original command fingerprint with the original attempt principal and typed command fields; never substitute the recovery actor.
3. Author one new forward-only, unexecuted migration (proposed `20261026000033_owner_identity_recovery_linearization_v1.sql`) that preserves migrations `000027`–`000032`, permits an independently authorized recovery principal, preserves operation/fingerprint/provider correlation and records the recovery actor/version separately in append-only audit evidence.
4. Keep recovery-only paths structurally unable to call provider creation. `UNKNOWN` or lost response remains pending; completion requires exact `FOUND` binding and a fresh recovery-completion authorization.
5. Add injected/static model regressions for revocation at every boundary, rotation, different recovery principal, same-principal stale credential, response loss, restart, no blind create, immutable replay and audit rollback.
6. Update ACL/source assertions for any new exact function signatures. PostgreSQL/Auth/provider execution and runtime authority provisioning remain separate gates.

No implementation or migration authoring is authorized by this reconciliation.

## Evidence and limitations

Executed in this batch: read-only HEAD/hash continuity, source inspection and SHA-256 calculation for the handoff. Unchanged tests were not rerun.

Not run: TypeScript behavior, PostgreSQL parsing/execution, migrations, fixtures, ACL/RLS, locks/concurrency, Auth/provider/browser, credentials, network, Docker/services/ports, runtime mapping, provisioning, activation, deployment or cleanup. The policy is **OWNER APPROVED — TECHNICAL ENFORCEMENT INCOMPLETE / NOT DATABASE VERIFIED**.

Stop for independent review and separate owner authorization before the proposed implementation correction.

## Superseding implementation addendum — PF-SUP-2026-10-26-14

The owner subsequently gave explicit authorization for the exact proposed bounded correction. The local implementation is now authored in the inactive gateway contracts/tests and forward-only, unexecuted migration `20261026000033_owner_identity_recovery_linearization_v1.sql`. The four demonstrated source mismatches above are corrected at source/synthetic level: dispatch, exact resolution and completion have fresh action-specific boundaries; original operation identity is loaded from durable evidence; alternate authorized recovery is applicant/context scoped; and recovery actor/version is separate append-only audit evidence.

This addendum does not rewrite the historical inspection finding. It supersedes only the earlier statement that implementation authorization was pending. Enforcement remains unverified in PostgreSQL/Auth/provider/browser/runtime, scope provisioning remains absent, and AUTH-02 remains deferred. Exact changes and local evidence are in `PHARMACYFLOW_BLK002_REV_LIN_01_IMPLEMENTATION_CORRECTION_2026-10-26.md` and its scoped manifest.
