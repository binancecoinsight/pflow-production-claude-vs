# MVP-02-CLOSE correction and acceptance completion — PF-SUP-2026-10-29-02

Baseline: PF-SUP-2026-10-29-02 review of the prior MVP-02-CLOSE package. This additive report supersedes the prior package’s mutation-response and preservation claims without rewriting its report or historical manifest.

## Completed correction

All four production inventory mutation clients now validate the operation-specific sealed M-13/M-14/M-15 response contracts before refresh or success publication.

- Intake accepts exactly one `COMPLETED` result, validates the server-generated purchase UUID, exact item count, safe total cost equal to the sealed quantity-by-unit-cost arithmetic, and a strict Gregorian RFC3339 timestamp. Divergent replay remains `IDEMPOTENCY_CONFLICT`.
- Adjustment validates exactly one adjustment UUID, the requested batch identity, signed delta matching direction and magnitude, safe `previous + delta = resulting` arithmetic, and a strict timestamp.
- Dispatch accepts exactly one valid server-generated transfer UUID with the request item count and original dispatch timestamp. `DISPATCHED` is valid for first execution and ordinary replay; `RECEIVED` is also valid for exact dispatch replay after the transfer lifecycle advances, exactly as sealed M-15 returns the current header status.
- Receive validates exactly one row, exact requested transfer identity, `RECEIVED`, a positive safe item count and strict timestamp. A different receive operation after receipt remains `TRANSFER_ALREADY_RECEIVED`; divergent exact-operation reuse remains a conflict.
- Null, missing, multi-row, malformed, unsafe, ambiguous-date, wrong-identity and contract-inconsistent evidence returns `UNEXPECTED_RESPONSE`. No default or numeric coercion fabricates success.

Snapshot ingestion now preserves authoritative product and batch tenant identifiers into local validation rather than replacing them with the requested pharmacy identifier. Duplicate products, duplicate batches, orphan associations, cross-tenant rows, unsafe quantities/prices and invalid dates are rejected before replacement. Each case compares complete cached product records, batch records and metadata before and after rejection.

The integrated durability check compares complete draft, sale, transaction and queue values after the inventory workflows, not only identifiers.

## Exact local evidence

| Command | Result |
|---|---:|
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/inventoryMutationResponseContracts.test.ts` | 101 passed, 0 failed |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/inventoryWorkflowIntegration.test.ts` | 42 passed, 0 failed |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/inventory.test.ts` | 71 passed, 0 failed |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/sync.test.ts` | 57 passed, 0 failed |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/stockIntake.test.ts` | 56 passed, 0 failed |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/stockAdjustment.test.ts` | 89 passed, 0 failed |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/stockTransfer.test.ts` | 35 passed, 0 failed |
| `node --loader ./scripts/typescript-loader.mjs src/components/inventory/stockTransferUi.test.ts` | 63 passed, 0 failed |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/sharedExpiryProductionPaths.test.tsx` | 14 passed |
| `node scripts/acceptance/mvp02-close-wiring.test.mjs` | 56 passed |
| focused strict TypeScript | PASS, no output |
| root TypeScript | PASS, no output |

The focused behavioral total is 528 passing assertions. No unchanged broad suite was rerun.

## Preserved contracts

RPC names and arguments, mutation payloads, stock accounting, ledger rules, idempotency/conflict behavior, database signatures, storage schemas, POS calculations, synchronization protocols and accepted expiry/attention/product-detail presentation remain unchanged. No authoritative stock effect is inferred from injected responses.

## Entitlement 000035 read-only separation

Migration `000035` and the associated subscription files were inspected and hashed only. They were not edited, integrated, activated, executed, deleted or tested under this inventory authorization.

| Preserved read-only file | SHA-256 |
|---|---|
| `supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql` | `5de903ae018947818d161c1ce4651058f220849f7844a3680a82c5a8bfacb46f` |
| `src/lib/subscription/capabilities.ts` | `cbbd646821f81d10cd61c8bab828708d2debfcc6b0a7bace9481dd803586d96a` |
| `src/lib/subscription/lifecycle.ts` | `caf7f7f591a1f01ecfad607e4cc925200dbea07236788a282bb7157b7b01b930` |
| `src/lib/subscription/lifecycle.test.ts` | `7aaaefb9a2ab82e2efa38ea9057367a7fece79ded8e11f5ed4517b3b2ce40638` |
| `src/lib/subscription/capabilityBoundary.ts` | `ebbe8bebc14a16f7ee1e4c0430cb38bf89adaa5ad91afb1b307a61a78cc93692` |
| `src/lib/subscription/capabilityBoundary.test.ts` | `9f2810596edfd547b11824fe44b5193861c249c0da6555f42c4f5dc371702c6a` |
| `src/lib/subscription/entitlementEnforcement.ts` | `10ad05879adcf1604ca95640565fe4f22e74739cecfa354d300c406266461f5c` |
| `src/lib/subscription/entitlement.test.ts` | `3bc85b1e1c8736515b7f9d01e2278a49591c262476fac15f48a10f9118394494` |
| `src/lib/subscription/index.ts` | `5b9f073b1f5cb971e9e6562fb2984242f02311566c73de39758a9113342aec13` |
| `scripts/acceptance/entitlement-wiring.test.mjs` | `50439bff28259cf093722c1e9103d2770d8af09bb769ba3774588460b8b54551` |
| `scripts/acceptance/tsconfig.entitlement.json` | `6750d27b6dbe977a21de36915c4b52e833c5d3908c3a70f423c7c22e2c48f73f` |

Identified defects requiring a separate protected-authoring milestone:

1. Replay bypass is not exact-operation evidence: an existing `sales.id` can satisfy the guard for an arbitrary `p_operation_type`; no operation type, client operation identity or payload fingerprint is bound.
2. Replay is checked before membership authorization, while the SECURITY DEFINER guard is executable by `authenticated`; a known cross-tenant sale identity can reach the early `TRUE` path.
3. The optional `sync_idempotency_log(operation_id, tenant_id)` shape is not defined anywhere in the current migration set, so that branch is an unsealed schema assumption.
4. The new anchor ledger is neither written nor consulted by the effective-entitlement function; lifecycle authority still comes from the mutable singleton `subscriptions` row.
5. `SUSPENDED` is handled by `000035`, but sealed M-3’s `subscriptions.status` constraint does not permit `SUSPENDED`; the intended state is unreachable without an explicitly reviewed forward schema contract.
6. The guard is not wired into the protected sale, inventory, refund/restock, customer, supplier, cash or device mutation boundaries, so the migration does not yet provide operation-level enforcement.
7. The client authoritative-payload resolver accepts partial/inconsistent evidence and ambiguous `Date.parse` timestamps rather than validating the full pharmacy/state/flags/time contract.

Smallest required owner authorization: **one complete BLK-003 / MVP-08 entitlement security-correction authoring milestone** covering forward-only correction of `000035` and its associated TypeScript/tests/static evidence; exact operation-type/client-operation/payload-fingerprint replay binding; membership before replay; an authoritative append-only anchor writer and evaluator; sealed M-3 status reconciliation; strict full response validation; and explicit enforcement wiring into every protected mutation boundary. This scope must remain local and unexecuted, with no migration execution, credentials, services, activation, deployment or Git mutation.

## Disposition

MVP-02 inventory is **LOCALLY ACCEPTED — SOURCE/SYNTHETIC/FAKE-INDEXEDDB ONLY — INDEPENDENT REVIEW REQUIRED**. Real browser/datastore, PostgreSQL/RLS/RPC, ledger/concurrency and production acceptance remain not run. AUTH-02 remains deferred.
