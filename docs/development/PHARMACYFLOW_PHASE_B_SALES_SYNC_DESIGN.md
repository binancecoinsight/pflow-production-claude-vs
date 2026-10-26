# PharmacyFlow Phase B Protected Sales and Synchronization Design

## PF-SUP-2026-10-23-02 closure and verification preparation — 2026-10-23

This incremental local batch retains the prior lease-completion, checkout-reset, recovery-order, timestamp and gateway-conflict corrections. It does not constitute browser, database or Phase B acceptance.

| Finding | Disposition | Source evidence | External gate |
|---|---|---|---|
| C-01 concurrent initialization | **CORRECTED LOCALLY** | `src/lib/pos/drafts.ts:49-82` performs one bounded winner reload after snapshot revision contention; `PosView.tsx:55,108-163,358-378` exposes failure and explicit retry; `phaseB.test.ts:154-201` covers fresh concurrent initialization, remount, retirement replacement and interrupted persistence. | Real-browser simultaneous tabs, interrupted transaction and remount acceptance. |
| C-02 storage lifecycle enforcement | **CORRECTED LOCALLY** | `src/lib/offline/db.ts:367-450` allows first freeze only from `DRAFT`, handles `LOCALLY_DURABLE` replay, and rejects missing/replaced/retired ownership; `phaseB.test.ts:228-252,317-327` covers current-revision cancellation/acknowledgement and record preservation. | Real IndexedDB clear/finalize and acknowledgement/new-checkout races. |
| C-03 recovery integrity | **CORRECTED LOCALLY** | `src/lib/sales/service.ts:198-226` recomputes both canonical digests and checks hashes, copies and identities; `phaseB.test.ts:259-313` covers valid replay, identically corrupted copies, stale hashes and mismatched copies while preserving IDs/time. | Browser restart/recovery and independently computed digest evidence. |
| C-04 actual UI lifecycle behavior | **CORRECTED IN PRODUCTION ADAPTERS / SYNTHETICALLY EXECUTED** | `checkoutUiLifecycle.ts:1-53` provides the production completion boundary; `CartPanel.tsx:83-140` uses it for lookup/create; `ProductSearch.tsx:43-147` uses it for search, barcode and duplicate selection; `phaseB.test.ts:123-152` drives those production adapters with delayed synthetic tasks across replacement/scope change/unmount. | Real React/browser event, unmount and accessibility acceptance. |

The next owner-review gate is authored, clearly unexecuted, in `PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md`. It specifies PharmacyFlow-only target controls, expected records/results, abort conditions and evidence collection for status-v2, M-18, Refund V2, IndexedDB, recovery, receipts and branch/cashier changes.

## PF-SUP-2026-10-22-01 acceptance-closure batch — 2026-10-23

Baseline: `main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`. This is a local correction checkpoint, not Phase B acceptance. Database execution, PostgreSQL concurrency/rollback verification, real-browser IndexedDB/UI acceptance, deployed Edge compatibility, independent financial/security review and deployment remain open approval gates.

### Finding disposition and source evidence

| Finding | Local disposition | Evidence | Remaining gate |
|---|---|---|---|
| B-01 lease transaction completion | **CORRECTED LOCALLY** | `src/lib/offline/db.ts:661-736` resolves every lease outcome from transaction completion; `src/lib/offline/phaseB.test.ts:232-270` aborts after a successful put request and proves zero transmission. | Real multi-tab browser contention/abort acceptance. |
| B-02 retired checkout ownership | **CORRECTED LOCALLY** | `src/lib/offline/db.ts:218-364` retains `CANCELLED`/`ACKNOWLEDGED` markers and limits replacement to explicit initialization; `src/lib/pos/drafts.ts:39-47` rejects missing, retired, replaced or stale finalization. | Browser clear/finalize, acknowledgement/new-customer, competing initialization and remount races. |
| B-03 status-v2 authorization | **CORRECTED IN UNEXECUTED ARTIFACT** | `supabase/migrations/20261014000026_client_operation_status_v2.sql:31-179` applies active membership, management, cashier-own-sale, permitted-return and incomplete/legacy actor rules before absence. Sealed migrations are unchanged. | Authorized SQL execution and cases below; independent authorization review. |
| B-04 checkout UI state | **CORRECTED LOCALLY** | `src/components/pos/PosView.tsx:108-155,290-316,365-382,402-425,442-449`; `CartPanel.tsx:51-150`; `ProductSearch.tsx:27-103`; `checkoutUiLifecycle.ts:1-37`. | Real browser lifecycle/accessibility acceptance. |
| B-05 real SQL error shapes | **CORRECTED LOCALLY** | `supabase/functions/sync-push-sale/index.ts:225-260` recognizes only M-18's named checkout constraint; `src/lib/offline/dispatcher.ts:316-347` makes it `CONFLICT`; `phaseB.test.ts:272-285` proves no resend. | PostgreSQL/PostgREST and concurrent M-18 verification. |
| B-06 durable retrieval order | **CORRECTED LOCALLY** | `src/lib/pos/orchestrator.ts:52-112` retrieves durable evidence after identity/session checks and before mutable validation. | Real restart/remount acceptance. |
| B-07 frozen fidelity | **CORRECTED LOCALLY** | `src/lib/sales/service.ts:198-284` checks draft/transaction/queue/hash/identity/time and reads payload `created_at`; `PosView.tsx:442-449` prevents receipt customer substitution. | Browser readers and server receipt comparison. |

### Status-v2 authorization matrix

| Caller/evidence | Result |
|---|---|
| No session, inactive member, or different tenant | `42501 OPERATION_STATUS_FORBIDDEN`; no existence disclosure. |
| Active OWNER/MANAGER/PHARMACIST | Tenant-wide sale/return evidence, matching M-8; incomplete/legacy evidence remains `UNKNOWN`/`CONFLICT`, never absence. |
| Active CASHIER, own sale | Permitted when `sales.cashier_id = auth.uid()`, matching M-8 even after active-branch selection changes. |
| Active CASHIER, another cashier's sale | `42501`, including when a journal exists. |
| Return author or cashier of original sale | Permitted, matching M-9. |
| Unrelated active member, another user's return | `42501`. |
| Journal-only incomplete evidence | Management or matching `actor_user_id` receives conservative non-absence evidence; others receive `42501`. |
| Legacy stock journal | Management/original actor may receive `UNKNOWN`; never financial completion. |
| Truly absent after tenant-wide existence checks | Active member may receive `CONFIRMED_ABSENT`; an inaccessible existing row cannot fall through. |

Status lookup does not relax M-18 commit branch rules. Existing M-8/M-9 read visibility—not current UI branch selection—governs historical operation evidence.

### Later authorized SQL acceptance cases (not executed)

1. Across two tenants, two branches and two cashiers, assert no-session/inactive/cross-tenant calls always raise `42501` for present and absent IDs.
2. Assert OWNER/MANAGER/PHARMACIST can inspect same-tenant cross-branch/cashier evidence; CASHIER sees only own sale and never receives absence for another cashier's existing operation.
3. Assert return author and original-sale cashier can inspect Refund V1/V2; unrelated cashier cannot. Incomplete header/item/allocation evidence must remain non-absence.
4. For journal-only unified/return evidence, require actor/management visibility, denial for others, and no committed result without complete evidence.
5. For legacy-stock journals, require `UNKNOWN`, never committed/absent, with actor/management visibility only.
6. A truly missing random operation may return `CONFIRMED_ABSENT` only after sale/return/journal probes; an inaccessible existing row must raise `42501`.
7. Run concurrent exact operation/hash replay, changed-hash replay and same-checkout/different-operation cases against M-18; verify nonce/transaction rollback and capture the real PostgREST `23505` shape for `uq_sales_pharmacy_checkout_intent`.

### Scoped source hash manifest

SHA-256, lowercase; documentation is excluded to avoid a self-referential manifest.

```text
08370cea83ff2f10824a7fcdbde04fb08596c9a4fafef59e001ddcc0d2264ef1  src/lib/offline/db.ts
b65e419a1bb6ac7f6727ad8a117bb96a120bf6100dc2948851fc0dc180abcde9  src/lib/offline/types.ts
b17db8000a1c6b45b24dfe71e208b1bef196be55e8da14e034bff5f372a16f45  src/lib/offline/dispatcher.ts
acbb9d2852e1858c64a8370582ce4b839ab03899f79994ef424aefa24fac70cb  src/lib/offline/phaseB.test.ts
ac0d853397e8365a17526d50d772540c7b80de82c6601fa059bad4218ecb4dc1  src/lib/pos/drafts.ts
45cc2ea81c2bfe86a1682378cbfd2552814c373655846dca13bbaab194b9b3ce  src/lib/pos/orchestrator.ts
2fcd05a2a64fa95a24c0282f19cef120c36ea48e1bf8e72914b4ff9e07b8233f  src/lib/sales/service.ts
394c339e2934ca216a8215c16ae41a4c4fc8208ad8579d22918ce23683c04761  src/lib/sales/sales.test.ts
9fe6e91f3cd9507efc4f0182fce0832fd670e1bec8f906cd3736bea566714aae  src/components/pos/PosView.tsx
bb18145c5fb77939f84fd862e818599abb55837f49072ac32b88c59300207a26  src/components/pos/CartPanel.tsx
92d58ce0d19c1ec6efcaa965658459dd8a15d919e487cc474fe56fbb4f6dde2e  src/components/pos/ProductSearch.tsx
faeebdbf02f4fab0a4348dc390ab34d368d7ad99e64afdf6e32776d0a7653f83  src/components/pos/checkoutUiLifecycle.ts
f69425ee659d307c2244f1d29e0753879b40089d081d2e1f2ac4ff40a96014e8  src/components/pos/posUi.test.ts
07534b343897c75667ed750f2adab73b0d0cf45011c807cc5a4e3cc19a49f0a3  src/lib/pos/pos.test.ts
cf9bb2b71fd0c7ddf089ca842be09ec19cdd831d26ab224cc354bf803b01c3f5  supabase/functions/sync-push-sale/index.ts
ffaeed9bec147e8e17ac5835fe9959efdb6cd6d02d3ab0d492b94bc5ebdb0cbc  supabase/functions/sync-push-sale/index.test.ts
4ec722303800139e88e75e91bbc2d873dc70bc59a0a8870425a613adc5a6ca8f  supabase/migrations/20261014000026_client_operation_status_v2.sql
```

## Correction-batch implementation delta — 2026-10-22

- Draft mutations now require scope plus checkout/operation/sale identity and an expected revision. Stale snapshot, cancel and acknowledgment attempts fail closed.
- POS async catalog/cart/finalize/acknowledgment work carries a scope generation token; pharmacy, branch or cashier changes invalidate delayed UI writes and clear customer/receipt/completion state.
- A locally durable checkout is recovered before mutable inventory, customer or tender validation. Production sales cannot use the non-draft path; that path is isolated behind an explicit test-compatibility flag.
- Queue leases carry revision and token evidence. `SYNCING`, including an expired lease, requires reconciliation and is never directly reacquired. Atomic resolution requires expected status/revision/token, rejects missing records, validates result identity/hash, and cannot overwrite terminal outcomes.
- Status-v2 client evidence requires pharmacy, record and return identities. The authored SQL proves unified-sale or Refund V1/V2 rows and effects, reports authorized absence explicitly, and never upgrades legacy stock evidence into financial completion.
- Gateway normalization gives SQLSTATE precedence, accepts exact allowlisted markers only, and treats unknown `23505` as generic failure. M-18 replay validates top-level and original timestamps independently.
- Executed synthetic/static evidence: Phase B 32/32, gateway 68/68, complete root 32/32, Admin readiness 18/18, and TypeScript no-emit. SQL execution, database concurrency, browser IndexedDB, services and deployment were not run.

Date: 2026-10-22

Status: **IMPLEMENTED LOCALLY / DEPLOYMENT PENDING**. Phase B source, tests, IndexedDB v4, and an unexecuted forward-only status-v2 migration are now authored. Database execution, SQL/concurrency verification, deployment, and production acceptance remain separately approval-gated.

## Phase B implementation checkpoint

- **IMPLEMENTED SOURCE:** pharmacy/branch/cashier-scoped durable drafts reserve checkout, operation, sale, line and creation identities; POS remount, cancellation, acknowledgment/new-customer and scope-switch behavior preserve unresolved operations.
- **IMPLEMENTED SOURCE:** IndexedDB v4 adds only `checkout_drafts`; first-payload freeze plus transaction/queue creation and validated resolution plus transaction/queue/result updates are atomic.
- **IMPLEMENTED SOURCE:** dispatcher outcomes are `CONFIRMED_COMMITTED`, `CONFIRMED_ABSENT`, `IN_PROGRESS`, `CONFLICT`, and `UNKNOWN`; response loss, malformed success and missing/unavailable lookup remain non-dispatchable `UNCERTAIN`.
- **IMPLEMENTED SOURCE:** incomplete legacy stock-only sales are quarantined without rewriting their payload, hash or IDs. Unified reads no longer invent a missing checkout identity.
- **IMPLEMENTED SOURCE:** the sale gateway has sanitized Error/plain-object normalization, strict M-18 result validation (including top-level `ALREADY_COMMITTED` with the original committed response payload), and no fabricated commit defaults.
- **AUTHORED, NOT EXECUTED:** `20261014000026_client_operation_status_v2.sql` supplies explicit tenant authorization, authorized absence, operation-kind/hash/identity evidence, legacy-stock distinction and Refund V1/V2 handling. Sealed migrations remain unchanged.
- **EXECUTED SYNTHETIC ACCEPTANCE:** local in-memory/fake-IndexedDB and injected-fetch tests only. The dedicated Phase B suite includes a synthetic v3-to-v4 upgrade and byte-for-byte historical-record assertion.
- **NOT EXECUTED:** PostgreSQL/migration application, SQL syntax execution, database concurrency, browser IndexedDB, Supabase/Edge integration, network/service access, deployment and production data verification.

The historical 6/6 characterization below remains a record that six unsafe observations were reproduced before remediation. It is not post-remediation acceptance evidence.

## Evidence boundary

> **6/6 characterization passing means six unsafe observations remain. There are two synthetic behavioral checks and four source-text checks across five defect families. This is not SQL or concurrency verification.**

The two behavioral checks run the real gateway pipeline with synthetic WebCrypto keys and injected in-memory dependencies. The four source-text checks inspect current repository files. None accesses IndexedDB, Supabase, PostgreSQL, Docker, browser data, credentials, or the network. Defect reproducers are not positive acceptance tests.

## Scoped source baseline

- **VERIFIED STATIC:** branch `main`, HEAD `d145324be6d5f1c787bceab6baf27ca0ce375eeb`; `origin/main` points to the same commit.
- Committed dispatcher/gateway behavior sends legacy single-stock fields and uses separate nonce consumption plus `rpc_ingest_sale_stock_movement`.
- The preserved uncommitted implementation changes sale dispatch to `checkout_intent_id`, adds optional `commitSale` routing to M-18, expands sale types/payloads with checkout intent, changes several numeric normalizations, and adds unified gateway tests.
- The uncommitted gateway mock adds a same-intent/different-operation success behavior not present in M-18.
- The Admin Support worktree changes replace the former mock-rich operational dashboard with the read-only readiness adapter and keep operations disabled.
- The package/test-loader and Refund/Edge artifacts remain concurrent user-owned work. Phase A did not edit protected production source or overwrite those changes.

## 1. Five-family defect matrix

| Family | Characterized observation and root cause | Financial/inventory risk | Synchronization/recovery and identity implications | Required safe outcome |
|---|---|---|---|---|
| B1. Durable checkout identity | Source check: POS carries no intent. `createCart` creates no durable identity; `finalizePosSale` passes no intent; `createLocalSale` generates operation, checkout, sale and time identities per call. | One customer action can create multiple sale, stock and tender effects. | Remount/restart/multi-tab retry loses continuity; a replacement identity can cross the intended branch/cashier workflow unless scope is persisted. | One pharmacy/branch/cashier-scoped draft owns stable checkout, operation, sale, item and creation identities; first durable snapshot is immutable. |
| B2. Legacy recovery | Source check: read reconstruction invents an intent while dispatch uses the unchanged payload's absent field. | Work can be permanently stranded; stock-only evidence may be overclaimed as a unified financial sale. | Rewriting payload/hash breaks signed provenance. Recovery must retain the original tenant, branch, operation kind and identity. | Preserve bytes/hash/IDs, quarantine unsupported records, reconcile by original tenant/op/kind, and never infer unified financial completion from stock-only evidence. |
| B3. Error and authoritative response contract | Two behavioral checks: plain Supabase error loses its code; empty status becomes HTTP 200 commit. Catch recognizes only `Error`; response paths contain success defaults. | False commit or wrong conflict policy can duplicate or hide sale, stock, tender and exception effects. | Dispatcher receives misleading success/terminal signals; response identities are not proven against the original tenant-bound operation. | Narrow sanitized error normalization and strict authoritative success-row validation. |
| B4. Reconciliation and uncertain outcomes | Source check: missing/null/unknown evidence can all flow toward retry. Resolver collapses no lookup/no row; recovery retries every non-commit; local success writes are separate. | A committed-but-response-lost sale may be submitted again; crash can leave contradictory local financial state. | UNKNOWN becomes effective ABSENT. Unauthorized/no-row is ambiguous; pharmacy/op identity and operation kind are missing from sufficient evidence. | Five explicit outcomes, bounded reconciliation, no dispatch from UNKNOWN, and atomic local resolution writes. |
| B5. Idempotency alignment | Source check: mock accepts same intent/different operation, while M-18 reaches a unique-constrained insert. | Tests can hide checkout conflicts or duplicate-attempt paths affecting sale/stock accounting. | A second operation identity is incorrectly treated as equivalent; tenant-scoped conflict behavior differs between mock and SQL. | Exact operation/hash replay only; changed hash is integrity conflict; same intent/different operation is checkout conflict. |

Tenant and identity impact across all families: every lookup, draft, queue transition, and result must remain bound to the original pharmacy. Checkout drafts are additionally bound to branch and authenticated cashier. Tenant/branch/user switches must not delete or reuse an unresolved identity.

## 2. Current source and exact Phase B file scope

### POS and sales

- `src/lib/pos/types.ts`
  - Extend `PosCart`/checkout draft types with lifecycle and stable identity references.
  - Extend `FinalizeSaleOptions` to require the draft identity rather than accepting an unrelated optional operation ID.
- `src/lib/pos/cart.ts`
  - `createCart`: create/load a pharmacy/branch/cashier-scoped draft through a dedicated persistence service.
  - `clearCart`: never erase or reuse a durable/uncertain checkout; create a new identity only after the prior checkout is safely detached from the active cart.
- New adjacent module, proposed `src/lib/pos/checkoutDraft.ts`
  - Create, load, freeze, acknowledge and pre-persistence-cancel drafts.
  - No networking and no authority to mark server commit.
- `src/lib/pos/orchestrator.ts`
  - `finalizePosSale`: validate the draft scope; freeze one sale snapshot; retrieve an already durable operation on retry; never generate replacement identities after ambiguity.
- `src/components/pos/PosView.tsx`
  - Restore drafts on remount/restart, show local durability separately from authoritative commit, block destructive cancellation/new-customer overwrite for unresolved operations, and make tenant/branch transitions explicit.
- `src/lib/sales/types.ts`
  - Require stable `checkout_intent_id`, `client_op_id`, `sale_id`, line IDs and client creation time in the frozen persistence input.
- `src/lib/sales/service.ts`
  - `createLocalSale`: consume the frozen identities; stop generating them inside repeated finalization; return an existing identical local operation rather than throwing or creating a replacement.
  - Read adapters must label legacy missing fields rather than fabricating persisted identity.

### Local persistence and recovery

- `src/lib/offline/types.ts`
  - Add typed lookup evidence/outcomes and explicit `UNCERTAIN`, `RECOVERY_REQUIRED`, and `CONFLICT` queue states.
  - Expand `OperationResult` to carry validated sale/checkout evidence and operation kind.
- `src/lib/offline/stateMachine.ts`
  - Permit only the transitions in the model below; notably, `UNCERTAIN` cannot transition directly to `SYNCING`.
- `src/lib/offline/db.ts`
  - Upgrade `DB_VERSION` and add `checkout_drafts` with pharmacy/branch/cashier scope indexes.
  - Add one atomic function that freezes a draft, stores the transaction, enqueues it, and marks the draft locally durable.
  - Add one atomic resolution function that updates queue, local transaction and operation result together.
  - Migrate no historic payload bytes, hashes, operation IDs or checkout identities.
- `src/lib/offline/dispatcher.ts`
  - `dispatchOne`: quarantine legacy missing-intent sales before transmission; classify transport ambiguity; parse and validate response evidence before commit.
  - `resolveAmbiguousOperation`: return the five explicit outcomes; never map missing/unknown evidence to absent.
  - `recoverStaleOperations`: reconcile first; dispatch only after `CONFIRMED_ABSENT` for a current complete contract.
- `src/components/OfflineSyncRuntime.tsx`
  - Call the versioned lookup adapter; keep operation-kind handling explicit; surface auth/device/recovery-required outcomes without losing tenant scope.

### Gateway and tests

- `supabase/functions/sync-push-sale/index.ts`
  - Add a pure error normalizer and pure authoritative result validator.
  - Remove proposed success fallbacks; emit HTTP 200 only for validated M-18 result rows.
  - Use typed sanitized errors; do not classify every `23505` alike.
- `supabase/functions/sync-push-sale/index.test.ts`
  - Replace the same-intent/different-op success mock with explicit conflict behavior and mirror transaction rollback semantics.
- Focused tests in `src/lib/pos/`, `src/lib/offline/`, and `supabase/functions/sync-push-sale/`
  - Keep defect reproducers separate from positive acceptance suites.
- `supabase/functions/sync-push-return-v2/index.ts` and Refund V2 tests
  - Expected production change: none unless shared response/recovery abstractions require an adapter.
  - Mandatory regression target because dispatcher state and persistence are shared.

File adjacency does not authorize unrelated changes, financial recalculation changes, refund-contract changes, tenant authorization changes, or edits to sealed migrations.

## 3. Durable checkout and queue state model

### Checkout draft lifecycle

```text
DRAFT
  -> VALIDATING -> DRAFT                    validation failed; same identity retained
  -> FREEZING -> LOCALLY_DURABLE            atomic draft + transaction + queue write
  -> CANCELLED                              allowed only before durable persistence

LOCALLY_DURABLE
  -> AUTHORITATIVE_COMMITTED                validated gateway or lookup evidence
  -> UNCERTAIN                              sent but outcome not proven
  -> CONFLICT                               authoritative integrity/checkout conflict
  -> RECOVERY_REQUIRED                      unsupported legacy/insufficient evidence
  -> ACKNOWLEDGED                           UI may start next customer; operation remains durable
```

`ACKNOWLEDGED` is a UI relationship, not server commit. A new customer gets a new draft without deleting the prior durable operation.

The frozen snapshot contains pharmacy, branch, cashier, checkout intent, client operation, sale ID, item IDs, client creation time, currency, customer, payment data, totals and lines. Its canonical payload and hash cannot change after `LOCALLY_DURABLE`.

### Queue transitions

```text
PENDING -> SYNCING
SYNCING -> COMMITTED | UNCERTAIN | RETRYABLE | AUTH_REQUIRED | DEVICE_BLOCKED
         | CONFLICT | RECOVERY_REQUIRED

UNCERTAIN -> COMMITTED | RETRYABLE (only after CONFIRMED_ABSENT)
           | IN_PROGRESS/UNCERTAIN | CONFLICT | AUTH_REQUIRED
           | DEVICE_BLOCKED | RECOVERY_REQUIRED

RETRYABLE -> SYNCING
AUTH_REQUIRED -> UNCERTAIN or RETRYABLE after renewed authorization and reconciliation
DEVICE_BLOCKED -> UNCERTAIN or RETRYABLE after device recovery and reconciliation
COMMITTED, CONFLICT, RECOVERY_REQUIRED -> no automatic dispatch transition
```

A fresh transport nonce and timestamp may be generated for a permitted retransmission under the existing signature contract. Pharmacy, branch, checkout intent, client operation, sale identity, payload and hash remain unchanged.

### Crash boundaries

- Before the atomic local write commits: the draft remains editable/retryable with the same reserved identities.
- After local write but before UI update: restart loads the locally durable draft and existing transaction; no second sale is created.
- After request transmission but before response: mark `UNCERTAIN`, then reconcile; do not immediately resubmit.
- During local success recording: update transaction, queue and validated operation result in one IndexedDB transaction so restart sees either the old uncertain state or the complete committed state.

## 4. Error normalization contract

The proposed pure adapter accepts `unknown` and returns only:

```ts
interface NormalizedGatewayError {
  category:
    | 'SERIALIZATION_FAILURE'
    | 'DEADLOCK_DETECTED'
    | 'NONCE_REPLAY'
    | 'PAYLOAD_HASH_CONFLICT'
    | 'CHECKOUT_INTENT_CONFLICT'
    | 'AUTHORIZATION_REJECTED'
    | 'VALIDATION_REJECTED'
    | 'UNKNOWN_DATABASE_REJECTION';
  sqlstate?: '40001' | '40P01' | '23505' | '23503' | '23514' | '42501' | '22023';
  safeMessage: string;
}
```

Rules:

- Read `message`/`code` only when they are strings on an `Error` or a plain object.
- Never copy `details`, `hint`, stack, SQL text, identifiers, tokens or arbitrary thrown values into the response.
- `40001` maps only to serialization failure; `40P01` only to deadlock.
- `23505` requires a recognized, allowlisted semantic marker. `NONCE_REPLAY`, payload/idempotency conflict, and checkout-intent conflict remain distinct.
- Unknown errors receive one generic safe response and server-side structured category logging without sensitive values.
- Gateway HTTP/error codes and dispatcher decisions are defined together; a nonce replay is ambiguous until operation lookup proves the outcome.

## 5. Authoritative commit response schema

M-18 already returns `operation_status`, `sale_id`, `processed_at`, and `response_payload`. Its committed `response_payload` contains `operation_status`, `sale_id`, `client_op_id`, `checkout_intent_id`, total, currency and processed time. The Phase B gateway validator should accept a row only when:

- `operation_status` is exactly `COMMITTED` or `ALREADY_COMMITTED`.
- Row `sale_id` is a valid UUID and equals signed payload `sale_id`.
- `response_payload` is an object with the matching allowed status.
- Response payload `sale_id`, `client_op_id`, and `checkout_intent_id` match the signed immutable request.
- Required processed time is valid.
- The inspected M-18 RPC call remains scoped by the authenticated actor, pharmacy, branch and device supplied to the transaction. Returned request echoes alone are not used as evidence.

Proposed validated gateway response:

```json
{
  "success": true,
  "operation_kind": "UNIFIED_SALE_V1",
  "operation_status": "COMMITTED",
  "sale_id": "authoritative-row-sale-id",
  "client_op_id": "validated-response-payload-op-id",
  "checkout_intent_id": "validated-response-payload-intent-id",
  "processed_at": "authoritative-row-time"
}
```

Null, empty array, empty object, invalid JSON, missing/unknown status, missing response payload, or any identity mismatch is not HTTP 200 success. Because the RPC may have committed before response validation failed, these cases are `UNCERTAIN`, not automatically absent or permanently rejected.

No M-18 modification is required for validation of a direct successful unified-sale commit. An `ALREADY_COMMITTED` row with missing or legacy response evidence is insufficient and enters recovery.

## 6. Reconciliation decision matrix

| Lookup outcome | Required evidence/action | Dispatch decision |
|---|---|---|
| `CONFIRMED_COMMITTED` | Authorized lookup; correct operation kind; matching pharmacy/op/hash; matching sale/checkout identities; committed unified effect evidence. Atomically store result and mark committed. | Never resend. |
| `CONFIRMED_ABSENT` | Versioned RPC explicitly returns absence after authorization. Empty result is not absence. | Current complete immutable operations may retry with the same payload/IDs and a fresh transport nonce/time. Legacy incomplete operations remain quarantined. |
| `IN_PROGRESS` | Matching journal reservation or processing state, without complete commit evidence. | Wait with bounded backoff and re-query; no submit. |
| `CONFLICT` | Same op/different hash, same intent/different op, wrong kind, or identity/effect mismatch. | Terminal explicit conflict; no new identity and no automatic retry. |
| `UNKNOWN` | Lookup unavailable, malformed, unauthorized ambiguity, timeout, missing resolver, or insufficient evidence. | Remain uncertain; bounded re-query/manual recovery. Never convert to absent. |

Special handling:

- Network response loss after send: `UNKNOWN` until lookup resolves.
- Unauthorized lookup: `AUTH_REQUIRED`/`DEVICE_BLOCKED`, never absent.
- Nonce replay: reconcile the original operation; do not blindly generate another operation.
- Crash during queue/result update: atomic local resolution restores a coherent old or new state.
- Concurrent dispatchers: IndexedDB lease remains necessary, but lookup and commit identities provide the authoritative barrier.
- Bounded policy: cap automatic lookup attempts/time window; then surface `RECOVERY_REQUIRED` without discarding the operation.

## 7. Legacy recovery contract

Legacy records are detected without mutation when the stored canonical payload lacks a valid checkout intent or complete unified-sale fields.

1. Verify stored payload hash before any action.
2. Preserve pharmacy, branch, operation ID, payload bytes and hash.
3. Mark the queue `RECOVERY_REQUIRED`; do not send it to the current unified gateway.
4. Query a versioned authoritative lookup using original pharmacy and operation.
5. Classify operation kind:
   - Unified sale with sufficient evidence: reconcile committed.
   - Legacy stock-only journal: report stock movement provenance only; do not claim unified sale/payment/financial completion.
   - Existing parent sale without sufficient unified journal evidence: surface the known sale and the unresolved synchronization gap; do not synthesize commit.
   - Explicitly absent or unknown: remain quarantined.

The current server cannot safely commit a confirmed-absent incomplete legacy payload under the requested constraints. Re-signing it as if it were a current unified sale would weaken the current payload contract. That path remains blocked.

If product owners require automated legacy completion, it needs a separately approved versioned recovery command and atomic RPC. The command must be distinct from ordinary sale submission, authenticate the device/user and original tenant provenance, carry the untouched original payload/hash as evidence, never replace the original business operation identity, define exactly which financial and stock effects are missing, and write an auditable recovery result. No speculative endpoint should be implemented in the initial Phase B client containment.

## 8. Existing database capabilities and the smallest missing capability

### Existing M-18 capabilities

- Atomic nonce consumption, journal reservation, sale header/items, stock, deficit and cash-exception effects.
- Replay by same pharmacy/operation with matching payload hash.
- Integrity rejection for same operation with a different hash.
- Unique checkout-intent and client-operation indexes.
- Direct RPC result with sale ID and response payload sufficient for strict immediate-response validation when complete.

### Existing status-RPC limitations

`rpc_get_client_op_status` returns only client operation, status, response status and processed time. It does not return payload hash, operation kind, journal record/sale ID, checkout intent, response payload, or proof that unified sale effects exist. It returns no row for both absence and failed membership visibility. It therefore cannot meet the required reconciliation contract.

### Required additive PostgreSQL capability

A forward-only versioned RPC such as `rpc_get_client_op_status_v2` is required for full B2/B4 acceptance. It should:

- Explicitly authorize the caller and distinguish forbidden from authorized absence.
- Return one typed lookup outcome.
- Return pharmacy, client operation, payload hash, journal table/operation kind, status, response status, record ID, sale ID, response payload and processed time.
- For unified sales, validate or expose a matching sales row/client operation/checkout intent so a committed journal can be tied to the actual unified effect.
- Identify legacy stock-only evidence separately.
- Preserve Refund V2 lookup behavior with an explicit operation kind.
- Remain tenant-scoped and grant execution only to the intended authenticated role.

This requires a new additive migration/RPC definition; sealed M-6, M-10 and M-18 remain unchanged. Authoring that migration and any recovery RPC requires explicit database-contract approval. Execution requires a later, separately approved PharmacyFlow-only disposable target.

## 9. IndexedDB requirement

An IndexedDB schema/version change is required to satisfy durable pre-finalize identity and restart recovery cleanly. Existing stores contain only completed local operations, queue rows, results and read models; they do not represent a scoped checkout draft.

Proposed `checkout_drafts` fields include draft ID, pharmacy, branch, cashier, checkout intent, client operation, reserved sale/time identities, cart snapshot, lifecycle state, frozen payload/hash when present, linked transaction ID and timestamps. Indexes must support unique active draft per pharmacy/branch/cashier and direct pharmacy/checkout lookup.

The upgrade is additive and must not rewrite existing stores or records. Historic local transactions are classified lazily as current complete or legacy recovery-required. Downgrade after schema use is not safe and must be addressed in rollout planning.

## 10. Compatibility and rollback risks

- Stricter gateway validation will expose previously hidden empty/malformed responses as uncertain. This is intentional but requires UI/queue handling to ship compatibly.
- Client deployment before status RPC v2 leaves uncertain operations visible and blocked; it must not fall back to unsafe resend.
- Status RPC deployment before the client is backward-compatible if additive and grants remain narrow.
- IndexedDB upgrade failure must leave existing v3 data readable by a controlled failure path; never delete/recreate the database.
- Multi-tab draft creation needs an atomic unique scope barrier, not only React state.
- Tenant/branch/user switches must retain but isolate unresolved drafts.
- Shared dispatcher changes can regress Refund V2. Return request construction, response handling, status evidence and terminal states need dedicated regression coverage.
- Tightening same-intent/different-op behavior may surface conflicts previously hidden by mocks; support messaging and recovery visibility are required.
- No rollback may rewrite or delete signed operations. Rollback containment is to stop dispatch, keep records uncertain/recovery-required, and deploy a forward correction.

## 11. Required focused acceptance specifications

These are specifications, **NOT RUN** until the implementation exists.

### Identity and legacy

- Missing-intent legacy bytes/hash/IDs unchanged; committed, absent and unknown outcomes.
- Legacy stock-only journal distinguished from unified sale; existing parent-sale evidence does not overclaim financial completion.
- Same op/same hash replay; same op/different hash conflict; same intent/different op conflict.

### Responses and errors

- Real M-18 `COMMITTED` and `ALREADY_COMMITTED` result shapes.
- Null, empty array/object, invalid JSON, missing/unknown status, malformed row.
- Wrong operation, sale or checkout identity.
- `Error`, returned/thrown Supabase object and unknown thrown value.
- `40001`, `40P01`, nonce replay, payload conflict, checkout conflict, and redaction.

### Recovery and local atomicity

- Response lost after commit; absent, unavailable, unauthorized and malformed lookup.
- In-progress journal; nonce ambiguity; bounded unknown handling.
- Interrupted queue write, result write and UI acknowledgment.
- Dispatcher restart and concurrent tabs.

### POS lifecycle

- Double click, validation retry, post-persist UI failure, remount, restart and cancellation.
- New customer, tenant switch and branch switch with unresolved prior checkout.

### Shared and Admin regressions

- Existing successful sale, offline retry, tenant/branch/device boundaries and no duplicate stock effect.
- Refund V2 request/response and recovery compatibility.
- Admin missing/loading/error/empty/partial states and disabled privileged actions.

Synthetic acceptance cannot prove PostgreSQL exactly-once behavior. Approved disposable-database tests must later inspect sales, items, stock ledger, financial/cash exception state, journal rows, rollback and tenant/branch effects rather than HTTP status alone.

## 12. Work classification

### Can be implemented and tested locally after Phase B approval

- POS identity/draft types and UX.
- IndexedDB v4 schema and atomic local operations using synthetic in-memory IDB tests.
- Queue states, pure validators, error normalizer and dispatcher decision logic.
- Gateway validation with injected local dependencies.
- Test-mock alignment, source/static checks and Refund V2 regression tests.

These remain protected source changes and are not authorized by Phase A.

### Requires database-contract approval

- Authoring the additive versioned status RPC migration.
- Any versioned legacy recovery RPC/route.
- Any grant or security-definer change.

### Requires separate execution/deployment approval

- Applying migrations to any database.
- Database/concurrency/financial acceptance.
- Edge or application deployment.
- Remote inspection or release operations.

## 13. Cohesive Phase B approval request

Recommended approval:

> Approve one protected Phase B implementation batch to add durable pharmacy/branch/cashier-scoped checkout drafts and an additive IndexedDB v4 store; bind stable checkout/operation/sale/item/time identities; add explicit uncertain/recovery/conflict queue handling and atomic local resolution; implement sanitized error normalization and strict M-18 response validation; quarantine legacy incomplete operations without changing their bytes/hashes/IDs; align idempotency mocks with SQL; preserve Refund V2 through focused regressions; and author, but do not execute, one forward-only migration defining `rpc_get_client_op_status_v2`. Do not implement an automated legacy commit endpoint in this batch. Do not execute a migration, access a database, deploy, or alter sealed migrations without a later approval.

Phase B completion gate:

- All focused local acceptance suites pass and the six defect reproducers no longer reproduce unsafe behavior or are replaced by clearly separate fixed-regression tests.
- Historic signed payloads/hashes/operation IDs remain byte-for-byte unchanged.
- Unknown outcomes cannot dispatch automatically or become committed.
- Refund V2 focused regressions pass.
- Migration receives independent security/financial review but remains unexecuted.
- PostgreSQL/concurrency acceptance and deployment remain **BLOCKED — APPROVAL**.
