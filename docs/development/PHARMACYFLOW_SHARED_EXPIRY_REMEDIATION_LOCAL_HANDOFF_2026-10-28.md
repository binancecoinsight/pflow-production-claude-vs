# PharmacyFlow Shared Expiry Remediation — Local Handoff

Date: 2026-10-28  
Disposition: **LOCALLY IMPLEMENTED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED**

## Approved contract implemented

- Batch expiry accepts only an exact, real Gregorian `YYYY-MM-DD` value. Prefixes, suffixes, whitespace normalization and impossible calendar dates fail closed.
- Reference dates accept valid `Date` objects, finite epoch milliseconds within the JavaScript `Date` range, exact date-only strings, or strict ISO/RFC3339 timestamps with an explicit timezone.
- Ambiguous JavaScript-parsable strings, invalid `Date`, `NaN`, infinities, out-of-range epochs, missing timezone and invalid time/offset components are rejected.
- Date-only values are UTC calendar days. Timestamp references use the actual instant's UTC calendar day, including offset day crossings.
- Epoch zero is preserved through nullish selection fallback. Same-day expiry remains expired (`days_until_expiry <= 0`). Valid FEFO ordering is unchanged.

## Fail-closed production behavior

- Snapshot and intake records use the strict date-only parser before the existing local write or injected RPC boundary. Rejected snapshots do not replace existing cached records; rejected intake invokes no executor.
- Inventory eligibility and recommendation validate every candidate before filtering or choosing. One malformed candidate blocks the complete operation rather than being skipped.
- Explicit and automatic POS selection return a controlled invalid-evidence failure before cart-line mutation.
- Sale finalization records a controlled validation error before `createLocalSale`. It creates no completed sale, local transaction or financial queue item.
- Existing durable checkout reservation recovery remains before mutable validation. A malformed expiry leaves the original DRAFT reservation and immutable checkout identities intact for later resolution; it does not create or substitute a checkout.
- Inventory detail uses explicit loading/ready/unavailable evidence states. Unavailable evidence suppresses empty-batch, projected-quantity, expiry and provisional FEFO claims.

No historical cache record is repaired, rewritten, deleted or migrated by this change.

## Scoped source and tests

Changed:

- `src/lib/inventory/expiry.ts`
- `src/lib/inventory/validation.ts`
- `src/lib/inventory/service.ts`
- `src/lib/pos/cart.ts`
- `src/lib/pos/orchestrator.ts`
- `src/components/inventory/InventoryView.tsx`
- `src/components/inventory/ProductDetailModal.tsx`

New:

- `src/lib/inventory/sharedExpiryRemediation.test.ts`
- `src/lib/inventory/sharedExpiryProductionPaths.test.tsx`
- `scripts/acceptance/shared-expiry-remediation-wiring.test.mjs`
- `scripts/acceptance/tsconfig.shared-expiry-remediation.json`
- this report and `SHARED_EXPIRY_REMEDIATION_LOCAL_HANDOFF_2026-10-28.sha256`

The accepted MVP-02A expiry-attention derivation remains byte-unchanged at SHA-256 `f739830808c633cfea9b7b75cf5525a79020bc30943436ea9cadb99251d1146c`.

## Executed local evidence

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.shared-expiry-remediation.json --noEmit` | PASS; exit 0; no output | Focused strict compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS; exit 0; no output | Root no-emit compilation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/sharedExpiryRemediation.test.ts` | `44 assertions passed`; exit 0 | Pure production parser, validation and selection paths |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/sharedExpiryProductionPaths.test.tsx` | `14 assertions passed`; exit 0 | Injected fake IndexedDB, zero-call fake RPC and in-memory React rendering |
| `node scripts/acceptance/shared-expiry-remediation-wiring.test.mjs` | `21 passed`; exit 0 | Static ordering, preservation and no-external-access assertions |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/inventory.test.ts` | `71 passed, 0 failed`; exit 0 | Existing affected inventory suite with injected fake IndexedDB |
| `node --loader ./scripts/typescript-loader.mjs src/lib/pos/pos.test.ts` | `76 passed, 0 failed`; exit 0 | Existing affected POS suite with injected fake IndexedDB |

The TypeScript loader emitted its standard experimental-loader warning. Modules importing the local Supabase wrapper printed the existing placeholder-client initialization notice. The focused production-path test supplied a fake client, proved zero RPC calls for invalid intake, and performed no network access.

## Evidence boundary

This is source, pure, injected fake-IndexedDB, static, in-memory rendering and compiler evidence only. It is not actual browser/IndexedDB, PostgreSQL/RLS, RPC, authoritative-stock, Auth/provider, concurrency or production acceptance. No schema, migration, server RPC, financial policy, synchronization, refund, I3 or authentication contract changed. AUTH-02 remains deferred.

Stop for independent review.
