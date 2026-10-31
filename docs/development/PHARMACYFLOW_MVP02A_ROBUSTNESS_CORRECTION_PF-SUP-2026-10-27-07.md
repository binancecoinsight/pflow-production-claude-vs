# PharmacyFlow MVP-02A Robustness Correction — PF-SUP-2026-10-27-07

Date: 2026-10-27  
Disposition: **LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED — INDEPENDENT REVIEW REQUIRED**

## Corrected findings

### Completed read failure versus loading

The production panel now gives a completed cache-read failure precedence over the loading/search-transition flag. This closes the reproduced state where a failure clears `loadedCatalogQuery`, leaving the query-mismatch loading expression true after `catalogReadError` is set. A retry still clears `catalogReadError` synchronously at the start of `loadLocalCatalog`, then presents genuine loading while the existing cache query runs. Query functions and call counts are unchanged.

### Runtime evidence validation

`deriveExpiryAttention` now validates product collections and the plain-record batch map before counting or iteration. Every batch group must be an array. Product and batch elements pass runtime record/type guards before derivation property access. Null collections, array-shaped maps, null groups, null elements and malformed records return immutable `unknown` coverage with no rows; they do not throw or produce the normal empty-cache message.

Normal complete, partial, empty and success behavior remains unchanged. The panel continues to derive only from the current `InventoryView` cache and performs no datastore or network access.

## Scoped files

Changed/new correction scope:

- `src/lib/inventory/expiryAttention.ts`
- `src/lib/inventory/expiryAttention.test.ts`
- `src/components/inventory/ExpiryAttentionPanel.tsx`
- `src/components/inventory/ExpiryAttentionPanel.test.tsx` (new)
- `scripts/acceptance/inventory-expiry-attention-wiring.test.mjs`
- `scripts/acceptance/tsconfig.inventory-expiry-attention.json`
- relevant progress, roadmap, blocker and evidence ledgers
- this report and `MVP02A_ROBUSTNESS_CORRECTION_PF-SUP-2026-10-27-07.sha256`

`src/components/inventory/InventoryView.tsx` required no source change: its existing retry start already clears the error, and the corrected panel consumes its actual post-error `isLoading/loadError` combination safely.

## Executed local evidence

| Command | Exact final result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/expiryAttention.test.ts` | `expiryAttention.test.ts: 48 assertions passed`; exit 0 | Production derivation with synthetic runtime-malformed evidence and injected clock |
| `node --loader ./scripts/typescript-loader.mjs src/components/inventory/ExpiryAttentionPanel.test.tsx` | `ExpiryAttentionPanel.test.tsx: 11 assertions passed`; exit 0 | In-memory server rendering of the production panel; no browser |
| `node scripts/acceptance/inventory-expiry-attention-wiring.test.mjs` | `Inventory expiry attention wiring tests: 31 passed`; exit 0 | Static production wiring, retry ordering and preservation assertions |
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.inventory-expiry-attention.json --noEmit` | PASS; exit 0; no output | Focused strict compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS; exit 0; no output | Root no-emit compilation |

The first post-edit focused compile identified TypeScript narrowing errors in the new runtime guards, and two interim static runs identified assertions tied to the replaced inline validation strings. Named type predicates and the static checks were corrected; the final results above are the completed verification. Node emitted only its standard experimental-loader warning.

## Preservation and limitations

The original MVP-02A report and manifest remain historical evidence. `src/lib/inventory/expiry.ts` remains byte-unchanged at reviewed SHA-256 `02033d8a21c2d123ef8bc99a002dcd8bd5f748989f9b273434f50131d345a18d`; its separately recorded shared-parser defect remains open. POS/FEFO, mutation controls, prices, storage, navigation, drafts, queues, protected contracts and low-stock scope are unchanged.

No actual browser, IndexedDB, RPC, database/SQL, Auth/provider, RLS, network, credential, Docker/service/port, installation, migration, Git mutation, provisioning, cleanup, destruction, activation, deployment or StoreFlow access occurred. AUTH-02 remains deferred. Stop for independent review.
