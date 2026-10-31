# MVP-02-CLOSE inventory acceptance matrix

Baseline: PF-SUP-2026-10-29-01; `main` `f36985ef7d23aa414e473cb8e79777a429fee375`.

Fake IndexedDB and injected Supabase-shaped executors establish only application behavior. They do not establish PostgreSQL atomicity, RLS/permissions, RPC implementation, stock-ledger correctness or authoritative stock effects.

| Workflow | Existing production implementation | Executed local evidence | Missing local integration evidence | Separately blocked evidence |
|---|---|---|---|---|
| Catalog and snapshot ingestion | `sync.ts`; `validation.ts`; `service.ts` atomic three-store replacement | Integrated valid replacement, tenant lookup, duplicate/orphan/unsafe/date rejection, suspicious-empty and stale-generation preservation; inventory 71/71; sync 57/57 | None demonstrated in the permitted client boundary | Actual IndexedDB/browser scheduling and failure injection; database/RLS source correctness |
| Current-branch batch intake | `submitStockIntake`; M-13 validation; refresh path | Injected request/response handling, malformed-success rejection, success refresh and failed-refresh preservation | None demonstrated | RPC authorization, transaction atomicity, ledger/audit effects and PostgreSQL idempotency |
| Adjustments | `adjustInventoryStock`; M-14 validation; refresh path | Valid/malformed response handling; signed cached deficits; failed-refresh preservation | None demonstrated | Row locking, permissions, ledger arithmetic and concurrent database effects |
| Transfers | dispatch/receive services and transfer UI | Valid/malformed response handling; transfer UI 63/63 | None demonstrated | Branch authorization, conservation, destination-batch effects, replay and database concurrency |
| Cached stock attention | `stockAttention.ts`; InventoryView/ProductList/panel | Branch aggregation, negative deficits, missing-versus-empty, safe-integer overflow and controlled bands | None demonstrated; accepted MVP-02B reused | Browser/IndexedDB and authoritative reconciliation |
| Cached expiry attention | strict shared expiry helpers; `expiryAttention.ts`; panels/detail | Invalid-date unavailable and branch attention; shared production paths 14/14 | None demonstrated; accepted expiry work reused | Browser lifecycle and authoritative reconciliation |
| Product detail | `productDetailLoad.ts`; InventoryView/modal | Branch publication, workspace switch, stale generation and close/unmount suppression | None demonstrated; accepted correction reused | Actual browser scheduling and datastore cancellation |
| Durable POS non-interference | POS drafts/orchestrator and offline stores | Real local checkout finalized before adversarial inventory work; draft, identities, sale, transaction and queue preserved | None for fake IndexedDB | Browser contention/restart and authoritative sale/stock commit |

Disposition: MVP-02 is locally accepted for inspected source, injected executors, in-memory helpers and isolated fake IndexedDB only. Database, browser and production acceptance remain open; AUTH-02 remains deferred.
