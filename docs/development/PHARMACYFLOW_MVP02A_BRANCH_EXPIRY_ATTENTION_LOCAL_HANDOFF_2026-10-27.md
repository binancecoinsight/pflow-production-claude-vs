# PharmacyFlow MVP-02A — Branch-Scoped Inventory Expiry Attention

Date: 2026-10-27  
Disposition: **LOCAL SOURCE/SYNTHETIC VERIFICATION COMPLETE — INDEPENDENT REVIEW REQUIRED**

## Authorized result

This bounded package adds a read-only expiry-attention surface to the inventory catalog. It derives only from the products, batches and freshness metadata already loaded by `InventoryView`; it introduces no RPC, IndexedDB, browser-storage, Auth, network or mutation path.

The panel is bound to the coherent active user, membership version, pharmacy, branch and role. It validates tenant/product/batch associations, duplicate identities, strict Gregorian dates, integer projected quantities and snapshot coverage before showing results. Invalid or unbound evidence produces an explicit unknown state, never a reassuring empty result.

## Behavior

- The current UTC calendar day is time-derived expired. The time-derived warning window includes day 90 and excludes day 91.
- Only positive, valid cached projected quantities for the current branch are shown.
- Server batch status is preserved independently from the time-derived expiry classification.
- Search subsets, the 100/200 product limits, metadata absence, count mismatches and snapshot-generation mismatches are partial coverage.
- A complete-cache empty result says only: “No matching expiry items in the loaded cache.” It explicitly does not claim that the branch has no expiry risk or that stock is safe to sell.
- Pharmacy/branch/identity/membership/role changes change or remove the workspace binding synchronously. Overlapping catalog/search reads now require the latest request generation and matching loaded query before expiry results can publish.
- Existing navigation, prices, mutation controls, POS/FEFO behavior, drafts, queues, synchronization, entitlements and storage contracts are unchanged. Low-stock/reorder-level work is excluded.

## Files

New:

- `src/lib/inventory/expiryAttention.ts`
- `src/lib/inventory/expiryAttention.test.ts`
- `src/components/inventory/ExpiryAttentionPanel.tsx`
- `scripts/acceptance/inventory-expiry-attention-wiring.test.mjs`
- `scripts/acceptance/tsconfig.inventory-expiry-attention.json`
- this report and `MVP02A_BRANCH_EXPIRY_ATTENTION_LOCAL_HANDOFF_2026-10-27.sha256`

Narrowly updated:

- `src/components/inventory/InventoryView.tsx`
- `docs/development/PHARMACYFLOW_PROGRESS.md`
- `docs/development/PHARMACYFLOW_ROADMAP.md`
- `docs/mvp/PHARMACYFLOW_MVP_ROADMAP.md`
- `docs/mvp/PHARMACYFLOW_BLOCKER_REGISTER.md`
- `docs/mvp/PHARMACYFLOW_TEST_EVIDENCE.md`

## Executed local evidence

| Command | Exact result | Boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/expiryAttention.test.ts` | `expiryAttention.test.ts: 40 assertions passed`; exit 0 | Pure production derivation/workspace logic with synthetic records and injected clock |
| `node scripts/acceptance/inventory-expiry-attention-wiring.test.mjs` | `Inventory expiry attention wiring tests: 27 passed`; exit 0 | Static source/wiring and shared-parser hash assertions |
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.inventory-expiry-attention.json --noEmit` | PASS; exit 0; no output | Focused strict compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS; exit 0; no output | Root no-emit compilation |

The Node test emitted only its standard experimental-loader warning. No unchanged PF-SUP-17, MVP-01B or MVP-01C suite was rerun.

## Preserved defect and dependency boundary

`src/lib/inventory/expiry.ts` is intentionally byte-unchanged at SHA-256 `02033d8a21c2d123ef8bc99a002dcd8bd5f748989f9b273434f50131d345a18d`. Its existing `Date.UTC(year, month - 1, day)` parser normalizes impossible dates rather than rejecting them. That shared parser is used by POS/FEFO and batch-selection paths, so repairing it could change operational behavior and requires a separately reviewed scope with regression evidence for those consumers. MVP-02A uses its own strict calendar parser and does not claim this shared defect is closed.

## Not run / not accepted

No browser/React runtime, IndexedDB, RPC, database/SQL, Auth/provider, RLS, network, credential, Docker/service/port, migration, installation, Git mutation, provisioning, cleanup, destruction, activation, deployment, authoritative stock reconciliation or production acceptance occurred. Cached projected quantities are not authoritative stock. Branch/RLS enforcement and real cache scheduling remain unverified. AUTH-02 remains deferred.

Stop for independent review.
