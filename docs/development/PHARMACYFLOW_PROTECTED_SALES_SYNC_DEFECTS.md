# PharmacyFlow Protected Sales/Sync Defect Analysis

## PF-SUP-2026-10-23-06 disposition

No completed Phase B or Refund V2 defect was reopened. Restricted draft retirement now uses checkout/scope generation and unmount invalidation, closing the newly demonstrated delayed-completion UI risk. Future concurrency preparation now requires relevant PostgreSQL lock-wait evidence and proven database-session termination before auxiliary cleanup. Both are **CORRECTED LOCALLY / SYNTHETIC OR STATIC ONLY**.

Database, SQL, Docker, real concurrency, Edge and browser evidence is **NOT RUN — OWNER DEFERRED** under AUTH-02. Status-v2 remains unexecuted; conservative UNKNOWN handling and legacy quarantine remain unchanged.

## PF-SUP-2026-10-23-02 disposition

C-01 concurrent initialization, C-02 first-freeze lifecycle enforcement, C-03 recomputed recovery digests and C-04 production async-adapter lifecycle protection are **CORRECTED LOCALLY**. Exact line evidence and refreshed hashes are in `PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`. C-04 evidence is isolated synthetic execution of production adapters, not browser acceptance. The external package in `PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md` is **AUTHORED / UNEXECUTED**.

Real browser IndexedDB/UI verification, database/status-v2/M-18/Refund V2 execution, independent review and deployment remain **OPEN / APPROVAL-GATED**. Sealed migrations and Refund V2 contracts remain unchanged.

## PF-SUP-2026-10-22-01 closure update — 2026-10-23

B-01 through B-07 are **corrected in local source** or, for B-03, in the already-authorized **unexecuted** migration artifact. The disposition table, exact source lines, authorization matrix, later SQL cases and scoped SHA-256 manifest are in `PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`. This is not Phase B acceptance: database execution, SQL concurrency/rollback proof, real-browser IndexedDB/UI acceptance, deployed compatibility, independent review and deployment remain **OPEN / APPROVAL-GATED**.

No sealed migration or Refund V2 contract changed. M-18 remains authoritative for exact operation/hash replay and rollback; only its named checkout constraint is normalized, while unknown unique violations remain generic and sanitized.

## Authoritative post-review correction checkpoint

The first Phase B pass was corrected for stale-tab draft ownership, async POS scope leakage, stale-lease resend risk, delayed reconciliation overwrites, incomplete status identities, SQLSTATE precedence, unknown unique violations, and incomplete positive regression coverage. Local source now uses draft revisions and queue lease tokens/revisions; resolution is CAS-protected and terminal-monotonic; missing transaction/queue pairs reject resolution; status evidence includes tenant/record/return identities; and the authored status-v2 SQL distinguishes unified sales, Refund V1/V2, legacy stock, authorized absence and conflicts.

Executed evidence is synthetic only: focused Phase B 32/32, gateway 68/68, adjacent offline/POS/sales/refund/inventory suites, Admin readiness 18/18, and complete root 32/32. The SQL was not executed and real browser/database/service/concurrency behavior remains unverified. Historical root-cause prose below describes the pre-remediation state and must not be read as current source behavior.

Date: 2026-10-22

Implementation status: **LOCALLY REMEDIATED / EXTERNAL VERIFICATION PENDING**. The authorized Phase B source and synthetic regression batch is implemented; the new SQL is authored but has not been executed or deployed.

## Remediation disposition

| Family | Implemented local control | Evidence state |
|---|---|---|
| Durable checkout identity | IndexedDB v4 scope draft, stable identities, durable snapshot restore, first-payload freeze and retry retrieval | Executed synthetic acceptance |
| Legacy recovery | Missing unified intent is not fabricated; incomplete stock-only work enters `RECOVERY_REQUIRED` unchanged | Executed synthetic acceptance |
| Error/response contract | Sanitized allowlist normalization; strict authoritative M-18 identity/timestamp validation; no success fallbacks | Executed gateway regressions |
| Reconciliation | Five outcomes, fail-closed missing resolver, non-resendable uncertainty, bounded lookup batch, atomic result resolution | Executed synthetic acceptance |
| Idempotency alignment | Exact op/hash replay succeeds; changed hash and same intent/different op conflict; rollback modeled in mock | Executed gateway regressions; SQL not executed |

Historical `6/6` means all unsafe observations were reproduced before this remediation. It must not be quoted as acceptance. Database execution, SQL/concurrency verification, deployment and remote behavior remain pending separate authorization.

## Evidence warning

> **6/6 characterization passing means six unsafe observations remain. There are two synthetic behavioral checks and four source-text checks across five defect families. This is not SQL or concurrency verification.**

The isolated script is `scripts/protected-sales-sync-characterization.ts`. It uses local source text, WebCrypto and injected in-memory dependencies only. It does not access IndexedDB, Supabase, PostgreSQL, Docker, browser data, credentials or the network. Its green result is **EXECUTED DEFECT REPRODUCTION**, not acceptance success.

## Six observations across five families

| # | Family | Evidence | Unsafe observation | Primary risk |
|---|---|---|---|---|
| 1 | Error/response contract | **EXECUTED DEFECT REPRODUCTION** | A thrown Supabase-shaped `{ message: 'NONCE_REPLAY', code: '23505' }` is collapsed to `SALE_COMMIT_REJECTED`. | Wrong recovery/terminal policy and loss of conflict meaning. |
| 2 | Error/response contract | **EXECUTED DEFECT REPRODUCTION** | An invalid empty operation status becomes HTTP 200 `COMMITTED`. | False local financial/stock commit. |
| 3 | Legacy recovery | **VERIFIED STATIC** | Sale reads synthesize a missing intent from `client_op_id`, but dispatch reads the unchanged signed payload and sends an absent intent. | Permanent failure or pressure to rewrite signed history. |
| 4 | Idempotency alignment | **VERIFIED STATIC** | Gateway mock accepts same checkout intent/different operation, while M-18 reaches a unique-constrained sale insert. | Passing tests describe behavior the SQL does not provide. |
| 5 | Reconciliation | **VERIFIED STATIC** | Missing lookup capability, null/non-committed evidence and thrown/unknown lookup outcomes can all flow back toward retry. | UNKNOWN is treated like effective ABSENT; ambiguous financial work can be resubmitted. |
| 6 | Durable checkout identity | **VERIFIED STATIC** | POS cart/finalization has no stable persisted checkout intent across retry, remount or restart. | Multiple checkout operations for one customer action. |

Adjacent **VERIFIED STATIC** findings strengthen observations 1, 2 and 5: both sale RPC adapters fabricate a commit row on empty data; the gateway response mapper defaults a falsey status to `COMMITTED`; the dispatcher accepts any HTTP 200 before validating sale/checkout identity; and local success recording spans separate IndexedDB transactions.

## Source-backed root causes

### B1 — Durable checkout identity and lifecycle

- `src/lib/pos/types.ts`: `PosCart` has no checkout lifecycle or durable identity.
- `src/lib/pos/cart.ts`: `createCart`/`clearCart` preserve only session/cart values.
- `src/lib/pos/orchestrator.ts`: `finalizePosSale` does not pass a checkout intent and accepts only an optional operation ID.
- `src/lib/sales/service.ts`: `createLocalSale` generates missing operation/checkout identities, sale ID and timestamp on every call.
- `src/components/pos/PosView.tsx`: `isFinalizing` prevents one mounted component's concurrent clicks only; a successful local result clears the cart before authoritative commit.

Expected safe behavior: one pharmacy/branch/cashier-scoped durable draft binds checkout, operation, sale, item and time identities; the first persisted snapshot freezes; retries retrieve rather than replace it; local durability and authoritative commit remain distinct.

### B2 — Legacy operation recovery

- `src/lib/sales/service.ts`: read fallback does not mutate stored bytes or hash.
- `src/lib/offline/dispatcher.ts`: request routing reads `payload.checkout_intent_id` directly.
- `supabase/functions/sync-push-sale/index.ts`: current unified route requires the field and signed-payload equality.
- M-6 legacy stock journal entries and M-18 unified entries both use sales-oriented journal records, but stock-only evidence is not proof of unified financial completion.

Expected safe behavior: verify hash, preserve all historical identities/bytes, quarantine incomplete records, classify operation kind, reconcile only with sufficient authoritative evidence, and never invent a current signed sale request. Confirmed-absent incomplete legacy completion remains blocked unless a separately approved recovery contract is designed.

### B3 — Error normalization and authoritative responses

- Gateway catch logic reads only `Error.message`; Supabase errors may be plain objects.
- SQLSTATE `23505` can represent nonce, operation/hash or checkout uniqueness and cannot be treated as one conflict.
- RPC adapters use `row || { operation_status: 'COMMITTED' }`.
- Gateway and dispatcher both contain additional `COMMITTED` defaults.

Expected safe behavior: narrow allowlisted normalization with redaction; distinct serialization, deadlock, nonce, payload and checkout conflicts; HTTP 200 only for a validated M-18 row whose authoritative sale/operation/checkout evidence matches the immutable signed operation.

### B4 — Reconciliation and uncertain outcomes

- `SyncDispatcher.resolveAmbiguousOperation` maps a missing resolver or null/non-committed row to `NOT_COMMITTED` and only thrown errors to `UNKNOWN`.
- `recoverStaleOperations` retries every result other than `COMMITTED`, including `UNKNOWN`.
- `rpc_get_client_op_status` returns no row for both authorized absence and membership-denied visibility, and lacks payload hash, operation kind, sale/checkout identity and response payload.
- Queue, local transaction and operation-result commit updates are not one local atomic write.

Expected safe behavior: explicit `CONFIRMED_COMMITTED`, `CONFIRMED_ABSENT`, `IN_PROGRESS`, `CONFLICT` and `UNKNOWN`; no automatic submission from unknown; bounded lookup; atomic local resolution; unauthorized and malformed lookups never become absence.

### B5 — Idempotency contract alignment

- M-18 replays only same pharmacy/operation after matching `payload_hash`.
- Same operation with a changed hash raises an integrity violation.
- Checkout intent is uniquely indexed, but M-18 has no same-intent/different-operation replay branch before the unconditional sale insert.
- The gateway test mock invents success for that unsupported case.

Expected safe behavior: same operation/same hash returns the original authoritative result; same operation/different hash is integrity conflict; same intent/different operation is explicit checkout conflict unless a separately approved equivalence contract exists.

## Current capability decision

- **VERIFIED STATIC:** M-18's direct result (`operation_status`, `sale_id`, `processed_at`, `response_payload`) is sufficient for strict immediate-response validation when complete and mutually consistent. M-18 itself need not be edited.
- **VERIFIED STATIC:** Existing status RPC output is insufficient for safe reconciliation and cannot distinguish authorized absence from forbidden/no-row behavior.
- **BLOCKED — APPROVAL:** A new forward-only `rpc_get_client_op_status_v2` is required for full recovery acceptance. It must be authored in a new migration; sealed migrations remain unchanged.
- **BLOCKED — APPROVAL:** An additive IndexedDB version/store is required for a durable pre-finalize checkout draft. No schema work was performed in Phase A.
- **NOT RUN:** PostgreSQL behavior, transaction rollback, real concurrency and financial/stock effects.

## Future acceptance tests

After protected implementation approval, focused tests must cover the full D1-D6 matrix in `PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`, including legacy committed/absent/unknown, operation/hash/checkout conflicts, malformed responses, all error shapes, response loss, unauthorized/malformed lookup, interrupted local writes, restart, multiple tabs, checkout cancellation/transitions, Refund V2 regressions and Admin preservation.

Synthetic tests cannot prove exactly-once database behavior. Later approved database acceptance must inspect sales, items, stock ledger, financial/cash exception state, journal records, rollback and tenant/branch effects.

## Protected Phase B proposal

The cohesive design, state transitions, response schema, legacy contract, decision matrix, file scope, rollback risks and exact approval language are in `docs/development/PHARMACYFLOW_PHASE_B_SALES_SYNC_DESIGN.md`.

Recommended scope: implement durable checkout drafts and IndexedDB v4 locally; add explicit uncertain/recovery/conflict handling and atomic local resolution; add gateway error/result validators; quarantine legacy records; align mocks with SQL; preserve Refund V2; and author—but do not execute—one additive status RPC v2 migration. Do not implement an automated legacy completion endpoint in this batch.

No database execution, deployment, remote access or sealed-migration edit is included.
