# Entitlement Contract Closure and Execution-Package Readiness

Checkpoint: PF-SUP-2026-10-30-03  
Date: 2026-10-30  
Disposition: complete for independent source/synthetic review; migration 000039 unexecuted

## Corrections

1. **Refund overload closure.** M-9's eight-argument `rpc_process_sale_return` remained independently callable after 000038. Migration 000039 renames that exact function to a private base, revokes every API role from the base, and recreates the exact authenticated signature as a guard-first delegating wrapper. The M-10 nine-argument wrapper and Refund V2 service-only wrapper remain unchanged and guarded. No refund arithmetic, restock, ledger, permission or response body was copied or rewritten.
2. **One entitlement decision.** `resolve_effective_entitlement_v3` now supplies both `rpc_get_effective_entitlement_v2` and the mutation boolean helper. Policy is deterministic: the latest effective administrative decision is ordered by PostgreSQL `TIMESTAMPTZ`, sequence and UUID; a negative decision blocks; an explicit positive decision removes the historical administrative overlay but never manufactures a valid commercial period; future decisions are ignored; when no effective decision exists, any preserved historical `SUSPENDED` anchor continues to block. Missing/invalid commercial periods fail closed, and active/grace boundaries use strict `<` comparisons.
3. **Idempotency parity.** The intake wrapper now uses the exact M-13 canonical representation: normalized identifiers, trimmed/defaulted optional values and deterministic product/batch/expiry item ordering. Adjustment, dispatch and receive use dedicated helpers matching their sealed canonical expressions. Guard and evidence fingerprints therefore agree with each sealed base for equivalent retries. Evidence remains after the delegated mutation in the same SQL statement, so an evidence conflict aborts the statement and rolls back the delegated effects.
4. **Execution proposal.** The disposable plan now lists every active migration through 000039, excludes quarantine, records exact refund overload grants, contains no invented target/identity/port, and separates run, fixture-cleanup and environment-destruction authority.

## Regression evidence

The closure test was authored and run before 000039. Baseline result: **3 passed, 17 findings**, including the unguarded M-9 overload, evaluator/guard divergence and missing sealed intake canonicalization. After correction:

| Check | Result |
|---|---:|
| Contract closure source assertions | 30 passed |
| Injected decision/fingerprint/atomicity model | 23 passed |
| Existing contract parity | 114 passed; quarantine defects retained: 4 |
| Canonical wiring | 92 passed |
| Foundation static | 11 passed |
| Foundation acceptance static | 25 passed |
| Existing entitlement wiring | 61 passed |
| Lifecycle / capability boundary | 15 / 9 passed |
| Foundation behavioral | 52 passed |
| Entitlement behavioral | 1,004 passed |
| Sale gateway security/order/idempotency | 70 passed |
| Focused strict / root TypeScript | pass / pass |

These are lexical source checks and injected/pure models. They are not PostgreSQL parsing, catalog resolution, migration application, RLS, transaction or concurrency proof.

## Remaining approvals

Independent acceptance is required first. Protected execution then requires one new owner instruction naming the disposable target, runtime/operator/credential mechanism and authorizing the immutable chain, bounded scenarios and evidence collection. Fixture cleanup and environment destruction each require explicit, separate authority. Direct-table enforcement policy and AUTH-02 remain separately gated.
