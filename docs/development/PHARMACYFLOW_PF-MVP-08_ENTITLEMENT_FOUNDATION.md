# PharmacyFlow PF-MVP-08 / BLK-003 Consolidated Technical Handoff

## 1. Authorization Evidence & Milestone Scope

- **Milestone:** PF-MVP-08 / BLK-003 — Server-Authoritative Entitlement Foundation
- **Owner Authorization:** Formally authorized under `PHARMACYFLOW — PF-MVP-08 CONSOLIDATED MILESTONE MASTER PROMPT`.
- **Target Repository:** `C:\Users\Flourish\Documents\GitHub\pflow-production claude vs` (PharmacyFlow).
- **Execution Mode:** Local source authoring, forward-only unexecuted SQL migration drafting, synthetic testing, and documentation.
- **Strict Invariants:**
  - Zero PostgreSQL database execution or remote Supabase network mutations.
  - Sealed migrations `000001` through `000016` strictly preserved.
  - Refund V2 / M-18 and Phase B contracts untouched.
  - `storeflow-platform` workspace strictly isolated and untouched.
  - `AUTH-02` remains deferred.

---

## 2. Completed Stages Summary

- **Stage 1 (Baseline & Dependencies):** Analyzed subscription schemas (M-3 `public.subscriptions`, `public.subscription_plans`), lifecycle derivation (`src/lib/subscription/lifecycle.ts`), capability boundaries (`capabilityBoundary.ts`), and identified all protected database mutation entry points across sales, inventory, refunds, transfers, customers, devices, and staff management.
- **Stage 2 (Author Server-Authoritative Contract):** Authored forward-only unexecuted SQL draft `supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql`. Defined `public.pharmacy_entitlement_anchors` active audit ledger, UTC clock derivation (`timezone('utc', now())`), `rpc_get_effective_entitlement_v1`, and 14-day trial / 7-day grace preservation.
- **Stage 3 (Operation-Level Enforcement):** Authored `assert_pharmacy_mutation_entitled_v1(UUID, TEXT, UUID)` with strict authentication and membership checks preceding replay inspection. Produced the comprehensive Operation-Level Enforcement Matrix covering all 11 mutation pathways, explicitly identifying sealed RPC bypasses and the proposed future wiring migration.
- **Stage 4 (Offline Recovery & Expiry Semantics):** Established deterministic offline recovery rules: device timestamps are untrusted for entitlement authority; legitimate committed operations in `sales`, `sale_returns`, `purchases`, `stock_adjustments`, `stock_transfers`, or `sync_journal` pass through replay bypass; unproven new mutations fail closed to prevent split-brain states while client preserves financial evidence for reconciliation.
- **Stage 5 (Client Contract Adapter):** Authored typed capabilities (`capabilities.ts`), lifecycle derivation with complete response shape validation (`lifecycle.ts`), operation evaluators (`entitlementEnforcement.ts`), and inactive injected RPC/offline fallback adapters (`entitlementAdapter.ts`).
- **Stage 6 (Synthetic Tests & Regression):** Authored and executed 483 assertions in `entitlement.test.ts`, 15 in `lifecycle.test.ts`, 9 in `capabilityBoundary.test.ts`, 60 static wiring assertions in `entitlement-wiring.test.mjs`, and verified zero TypeScript diagnostics under focused and root compilation.
- **Stage 7 (Milestone Documentation):** Updated canonical ledgers (`PHARMACYFLOW_PROGRESS.md`, `PHARMACYFLOW_ROADMAP.md`, `PHARMACYFLOW_MVP_ROADMAP.md`, `PHARMACYFLOW_BLOCKER_REGISTER.md`, `PHARMACYFLOW_TEST_EVIDENCE.md`) and published scoped SHA-256 manifest.

---

## 3. Server Entitlement Architecture (`000035`)

**File:** [`supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql`](file:///C:/Users/Flourish/Documents/GitHub/pflow-production%20claude%20vs/supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql)

### 3.1 Preconditions & Tamper Resistance
- Validates presence of `public.subscriptions`, `public.subscription_plans`, `public.pharmacies`.
- Fails cleanly if `public.pharmacy_entitlement_anchors` already exists.

### 3.2 Active Audit Anchor Ledger (`public.pharmacy_entitlement_anchors`)
- Append-only audit table recording all entitlement state transitions and administrative overrides.
- `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- `SELECT` policy restricted to active pharmacy members (`is_pharmacy_member`) and platform admins (`is_platform_admin('ADMIN')`).
- Direct `INSERT`, `UPDATE`, and `DELETE` revoked from `authenticated, anon, public`.
- **Automated Audit Trigger (`trg_subscriptions_entitlement_anchor`):** Fires `AFTER INSERT OR UPDATE OF status, plan_code, current_period_end ON public.subscriptions` to automatically snapshot subscription state changes into the anchor ledger.
- **Admin Procedure (`rpc_record_entitlement_anchor_v1`):** `SECURITY DEFINER` function allowing platform admins to record administrative suspensions or special overrides with caller identity provenance (`ADMIN:uid`).

### 3.3 Authoritative Resolution (`rpc_get_effective_entitlement_v1`)
- Hardened `SECURITY DEFINER` function with fixed `search_path = pg_catalog, public, pg_temp`.
- Caller authorization: verifies `is_pharmacy_member(p_pharmacy_id) OR is_platform_admin('ADMIN')`.
- Clock authority: strictly derives time from PostgreSQL UTC transaction clock: `timezone('utc', now())`. Client timestamps are completely ignored.
- **Lifecycle State Resolution:**
  - Administrative Suspension: Checks latest anchor in `pharmacy_entitlement_anchors`; if `status = 'SUSPENDED'` or `mutations_allowed = FALSE`, returns `SUSPENDED` with `mutations_allowed = FALSE`.
  - `TRIAL`: Within `current_period_end` (14 days), `mutations_allowed = TRUE`.
  - `ACTIVE`: Within `current_period_end`, `mutations_allowed = TRUE`.
  - `GRACE`: Period ended but `now < current_period_end + INTERVAL '7 days'`, `mutations_allowed = TRUE`, plan features identical to active tier.
  - `PAST_DUE`: During 7-day grace window, `mutations_allowed = TRUE`; past grace window, transitions to `EXPIRED`.
  - `CANCELLED` / `EXPIRED`: `mutations_allowed = FALSE`.
  - `UNKNOWN`: Missing subscription record or corrupt dates fail closed with `mutations_allowed = FALSE`.
  - **Historical Reads:** Unconditionally sets `historical_reads_allowed = TRUE` across all states.

### 3.4 Mutation Assertion (`assert_pharmacy_mutation_entitled_v1`)
- Operation-level security guard raising `P0001` with `ENTITLEMENT_EXPIRED`, `ENTITLEMENT_SUSPENDED`, or `ENTITLEMENT_UNKNOWN`.
- Authentication and tenant membership verified **prior** to any replay inspection.
- Replay preservation: checks `sales`, `sale_returns`, `purchases`, `stock_adjustments`, `stock_transfers`, and `sync_journal` for previously accepted operation reconciliation.

---

## 4. Operation-Level Enforcement Coverage Matrix

| Mutation Pathway | In-Scope Operation | Entry Point | Current Auth & Security Definer Status | Entitlement Checked in Sealed RPC? | Bypass if Only Helper Added? | Additive Server Enforcement Authored | Client-Side Enforcement Authored | Replay & Recovery Handling | Gap Status & Proposed Resolution |
|---|---|---|---|---|---|---|---|---|---|
| **Sales Ingestion** | `SALE_CREATE` | `rpc_ingest_sale_stock_movement` (M-6) / `sync-push-sale` | SECURITY DEFINER; verifies `auth.uid()`, active membership, `sales.create` permission | NO (sealed M-6) | **YES** | Helper authored; table trigger blocked to prevent sync queue deadlock | `evaluateOperationEntitlement` checks `createSale`; blocks checkout | Pass-through if `sale_id` exists in `public.sales` | **RELEASE-BLOCKING**: Requires forward migration `000036` wrapping M-6 with `assert_pharmacy_mutation_entitled_v1` |
| **Sale Returns & Refunds** | `SALE_REFUND` | `rpc_process_sale_return` (M-10) / `process-refund-v2` | SECURITY DEFINER; verifies `auth.uid()`, active membership, `sales.refund` permission | NO (sealed M-10) | **YES** | Helper authored | `evaluateOperationEntitlement` checks `createRefundOrRestock` | Pass-through if `client_op_id` in `sale_returns` or `sync_journal` | **RELEASE-BLOCKING**: Requires forward migration `000036` wrapping M-10 |
| **Stock Intake / Receiving** | `STOCK_INTAKE` | `rpc_receive_inventory_stock` (M-13) | SECURITY DEFINER; verifies `auth.uid()`, active membership, `inventory.write` / `purchases.manage` | NO (sealed M-13) | **YES** | Helper authored | `evaluateOperationEntitlement` checks `mutateInventory` | Pass-through if `client_op_id` in `purchases` | **RELEASE-BLOCKING**: Requires forward migration `000036` wrapping M-13 |
| **Stock Adjustments** | `STOCK_ADJUST` | `rpc_adjust_inventory_stock` (M-14) | SECURITY DEFINER; verifies `auth.uid()`, active membership, `inventory.adjust` / `inventory.write` | NO (sealed M-14) | **YES** | Helper authored | `evaluateOperationEntitlement` checks `mutateInventory` | Pass-through if `client_op_id` in `stock_adjustments` | **RELEASE-BLOCKING**: Requires forward migration `000036` wrapping M-14 |
| **Transfer Dispatch** | `TRANSFER_DISPATCH` | `rpc_dispatch_stock_transfer` (M-15) | SECURITY DEFINER; verifies `auth.uid()`, active membership, role branch assignment | NO (sealed M-15) | **YES** | Helper authored | `evaluateOperationEntitlement` checks `mutateInventory` | Pass-through if `dispatch_client_op_id` in `stock_transfers` | **RELEASE-BLOCKING**: Requires forward migration `000036` wrapping M-15 |
| **Transfer Receive** | `TRANSFER_RECEIVE` | `rpc_receive_stock_transfer` (M-15) | SECURITY DEFINER; verifies `auth.uid()`, active membership, destination branch role | NO (sealed M-15) | **YES** | Helper authored | `evaluateOperationEntitlement` checks `mutateInventory` | Pass-through if `receive_client_op_id` in `stock_transfers` or status is `RECEIVED` | **RELEASE-BLOCKING**: Requires forward migration `000036` wrapping M-15 |
| **Staff Invitations** | `STAFF_INVITE` | `rpc_create_staff_invitation` (M-16) | SECURITY DEFINER; verifies caller role, seat quota, and inline subscription status | PARTIAL (checks M-3 directly, but **omits** 7-day grace window) | **YES** (denies GRACE) | Helper authored | `evaluateOperationEntitlement` checks `canManageStaff` | Invitations cannot be created offline | **RELEASE-BLOCKING**: Requires forward migration `000036` updating M-16 to call `rpc_get_effective_entitlement_v1` |
| **Staff Modifications** | `STAFF_UPDATE` / `STAFF_REMOVE` | `rpc_update_staff_member`, `rpc_remove_staff_member` (M-16) | SECURITY DEFINER; verifies OWNER/MANAGER role | NO (sealed M-16) | **YES** | Helper authored | Client blocks staff administration when expired | Staff mutations cannot be created offline | **RELEASE-BLOCKING**: Requires forward migration `000036` wrapping M-16 |
| **Customer Mutations** | `CUSTOMER_CREATE` / `CUSTOMER_UPDATE` | Direct table mutations on `public.customers` (M-11) | Standard RLS: `is_pharmacy_member(pharmacy_id)` | NO (sealed M-11) | **YES** | Helper authored | `evaluateOperationEntitlement` checks `mutateCustomers` | Offline customer sync uses `sync_journal` | **RELEASE-BLOCKING**: Requires forward migration `000036` adding RLS `WITH CHECK` constraint |
| **Device Enrollment** | `DEVICE_ENROLL` | Direct table mutations on `public.devices` (M-4) | Standard RLS / Platform Admin | NO (sealed M-4) | **YES** | Helper authored | `evaluateOperationEntitlement` checks `enrollDevice` | Device enrollment requires live connectivity | **RELEASE-BLOCKING**: Requires forward migration `000036` adding RLS `WITH CHECK` constraint |
| **Subscription Anchor Admin** | `SUBSCRIPTION_ANCHOR` | `rpc_record_entitlement_anchor_v1` (M-35) | SECURITY DEFINER; verifies `is_platform_admin('ADMIN')` | **FULLY ENFORCED** in M-35 | **NO** | Native in M-35 with RLS + revoke grants | Inactive injected adapter | Not an offline operation | **CLEAN**: Fully enforced in authored migration `000035` |

---

## 5. Offline Recovery & Expiry Semantics

1. **Untrusted Client Clock**: Device timestamps never establish entitlement eligibility. If client local clock is set to the past, server UTC time (`timezone('utc', now())`) still enforces expiration.
2. **Operations Already Committed Remotely**: If an operation was already processed by the server (recorded in `sales`, `purchases`, `stock_adjustments`, `stock_transfers`, `sale_returns`, or `sync_journal`), idempotent re-dispatch returns the committed result regardless of current subscription state.
3. **Previously Accepted Operations Awaiting Dispatch**: When an operation was accepted by the cashier offline, but the subscription expires before synchronization:
   - On the client: `evaluateOperationEntitlement(lifecycle, op, true)` detects `isPreviouslyAcceptedReplay = true` and allows dispatch.
   - On the server: If the operation is not yet committed remotely, it fails closed for new live admission under an expired subscription, BUT the client preserves the local financial evidence in the offline queue (flagged as `UNRESOLVED_ENTITLEMENT_HOLD`) rather than discarding it.
   - Upon owner subscription renewal, the held operations replay and commit atomically.
4. **Historical Read Integrity**: Queries for receipts, customer records, inventory history, sales journals, and audit exports remain unconditionally authorized across `EXPIRED`, `SUSPENDED`, and `UNKNOWN` states.

---

## 6. Client Architecture & Inactive Adapters

- **`src/lib/subscription/capabilities.ts`**: Canonical definitions for `SubscriptionLifecycleState`, boolean `SubscriptionCapabilities`, and pure derivation `resolveCapabilities(state)`.
- **`src/lib/subscription/lifecycle.ts`**: Pure derivation `resolveSubscriptionLifecycle(sub, now)` for offline UI projections; authoritative parser `resolveAuthoritativeEntitlement(payload)` with exhaustive runtime validation of `pharmacy_id`, `state`, `mutations_allowed`, `historical_reads_allowed`, and `server_time`.
- **`src/lib/subscription/entitlementEnforcement.ts`**: Operation evaluators (`evaluateOperationEntitlement`, `assertOperationEntitlement`) and typed error `EntitlementViolationError` (`ENTITLEMENT_EXPIRED`, `ENTITLEMENT_SUSPENDED`, `ENTITLEMENT_UNKNOWN`).
- **`src/lib/subscription/entitlementAdapter.ts`**:
  - `createRpcEntitlementAdapter(executor)`: Inactive injected RPC adapter accepting an injected Supabase/mock executor. Makes zero live calls on its own and maps network failures/timeouts to `UNKNOWN` with `authoritative: false`.
  - `createOfflineFallbackEntitlementAdapter(cachedSub)`: Inactive fallback adapter returning advisory state (`authoritative: false`).
- **`src/lib/subscription/index.ts`**: Re-exports all modules.

---

## 7. Resolution of Seven GPT-6 Findings from PF-SUP-2026-10-29-02

| # | Finding from Review | Defect Identified | Exact Correction Implemented | Verification Proof |
|---|---|---|---|---|
| 1 | Replay bypass precedes membership | `assert_pharmacy_mutation_entitled_v1` checked replay before verifying caller membership | Caller authentication (`auth.uid() IS NOT NULL`) and active membership (`is_pharmacy_member`) are enforced **first** | Suite 3 in `entitlement-wiring.test.mjs` |
| 2 | Absent sync-log schema | Referenced StoreFlow's `sync_idempotency_log` | Replaced with PharmacyFlow's `public.sync_journal` and domain tables | Zero StoreFlow references in `000035` |
| 3 | Inert anchor ledger | `pharmacy_entitlement_anchors` was created but never populated | Added trigger `trg_subscriptions_entitlement_anchor` on `subscriptions` and admin RPC `rpc_record_entitlement_anchor_v1` | Suite 1 in `entitlement-wiring.test.mjs` |
| 4 | SUSPENDED conflicts with sealed M-3 | M-3 check constraint forbids `'SUSPENDED'` on `subscriptions` | `subscriptions` retains sealed statuses (`TRIAL, ACTIVE, PAST_DUE, CANCELLED, EXPIRED`); `pharmacy_entitlement_anchors` supports `'SUSPENDED'`, and `rpc_get_effective_entitlement_v1` derives administrative suspension from anchors | Suite 2 in `entitlement-wiring.test.mjs` |
| 5 | Enforcement unwired | Existing sealed RPCs do not invoke assertion | Produced exhaustive Enforcement Matrix identifying all 11 pathways, documented release-blocking status, and specified future migration `000036` | Section 4 of this handoff report |
| 6 | Incomplete client validation | `resolveAuthoritativeEntitlement` checked only `state` | Added strict runtime validation for `pharmacy_id`, `mutations_allowed`, `historical_reads_allowed`, and `server_time` | Assertions 2.6–2.9 in `entitlement.test.ts` |
| 7 | Missing authoring authorization | Previous draft was unapproved | Formally authorized by Owner in `PF-MVP-08 Consolidated Milestone Master Prompt` | Section 1 of this handoff report |

---

## 8. Verification Evidence Matrix

All verification executed locally in `pflow-production claude vs` with zero database/Docker execution:

| Suite | File | Count | Outcome |
|---|---|---:|:---:|
| Entitlement Comprehensive | `src/lib/subscription/entitlement.test.ts` | 483 assertions | **PASS** (exit 0) |
| Lifecycle Derivation | `src/lib/subscription/lifecycle.test.ts` | 15 assertions | **PASS** (exit 0) |
| Capability Boundary | `src/lib/subscription/capabilityBoundary.test.ts` | 9 assertions | **PASS** (exit 0) |
| Entitlement Static Wiring | `scripts/acceptance/entitlement-wiring.test.mjs` | 60 assertions | **PASS** (exit 0) |
| Inventory Upstream Wiring | `scripts/acceptance/mvp02-close-wiring.test.mjs` | 56 assertions | **PASS** (exit 0) |
| Focused TypeScript | `scripts/acceptance/tsconfig.entitlement.json` | 0 errors | **PASS** (exit 0) |
| Root TypeScript | `tsconfig.json` | 0 errors | **PASS** (exit 0) |
| Whitespace Integrity | `git diff --check` | 0 issues | **PASS** (exit 0) |
| Manifest Self-Check | `docs/development/PF-MVP-08_ENTITLEMENT_FOUNDATION.sha256` | 15/15 files OK | **PASS** (exit 0) |

**Total behavior verified:** 623 assertions passing across focused entitlement, capability, and preservation test suites.

---

## 9. Scoped File Manifest

Recorded at [`docs/development/PF-MVP-08_ENTITLEMENT_FOUNDATION.sha256`](file:///C:/Users/Flourish/Documents/GitHub/pflow-production%20claude%20vs/docs/development/PF-MVP-08_ENTITLEMENT_FOUNDATION.sha256):

```
46a285069ea3a29b4e8c73ea3e8148f890b6e692df7581ce9c8ac8ebb5d8fb64 *supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql
cbbd646821f81d10cd61c8bab828708d2debfcc6b0a7bace9481dd803586d96a *src/lib/subscription/capabilities.ts
8407064d17eb9e2587a42728f4c581f52625cfe9734e121f954647bbb2cca9ad *src/lib/subscription/lifecycle.ts
10ad05879adcf1604ca95640565fe4f22e74739cecfa354d300c406266461f5c *src/lib/subscription/entitlementEnforcement.ts
336f33cf23b49f98721c5b46e3d548f07297e5ea7a4fb2efca61be22b51341c3 *src/lib/subscription/entitlementAdapter.ts
931e6fd7b53ff2bbc4fd4014e109a09f9171f59c92b1756c97ccbfcbd8bccfd0 *src/lib/subscription/index.ts
e66a51db1a31c69c4d4284ef8175508749066b7dfe50e3454a5f407cb7ff8410 *src/lib/subscription/entitlement.test.ts
247a41cd149793dea8390a6dfd33ab5c8fec52d7883008a822b1f8a9d7df1d4b *scripts/acceptance/tsconfig.entitlement.json
5ec11c9f1bf718c2c82359f77925b0581e7b3802e20bcd6edb4043dd8eb08bc6 *scripts/acceptance/entitlement-wiring.test.mjs
[current] *docs/development/PHARMACYFLOW_PF-MVP-08_ENTITLEMENT_FOUNDATION.md
[current] *docs/development/PHARMACYFLOW_PROGRESS.md
[current] *docs/development/PHARMACYFLOW_ROADMAP.md
[current] *docs/mvp/PHARMACYFLOW_MVP_ROADMAP.md
[current] *docs/mvp/PHARMACYFLOW_BLOCKER_REGISTER.md
[current] *docs/mvp/PHARMACYFLOW_TEST_EVIDENCE.md
```

---

## 10. Remaining Blockers & Next Recommended Milestone

1. **Remaining Blockers**:
   - **BLK-003 Server Wiring (M-4)**: The authored `assert_pharmacy_mutation_entitled_v1` helper must be wired into the 8 sealed SECURITY DEFINER RPCs via forward migration `20261101000036_entitlement_rpc_wiring_v1.sql` prior to production deployment.
   - **AUTH-02 (Deferred)**: Remote Supabase Auth, live identity mapping, and live token evaluation remain deferred.
   - **PostgreSQL Execution (Blocked by Execution Authorization)**: Migration `000035` is an unexecuted draft. Live database application requires a dedicated disposable testing authorization.
2. **Next Recommended Milestone**:
   - Submit PF-MVP-08 for independent GPT-6 review.
   - Upon acceptance, proceed to **PF-MVP-09 — Entitlement Server Wiring & RPC Wrapping Design** (`000036`), authoring the forward-only RPC replacements that embed `assert_pharmacy_mutation_entitled_v1` into the operational mutation pipeline.

---

## 11. Final Milestone Verdict

**LOCAL AUTHORING & SYNTHETIC VERIFICATION: PASS**  
**RUNTIME SERVER ENFORCEMENT ON LIVE DATABASE: NOT RUN / PENDING FUTURE EXECUTION AUTHORIZATION**

**HALTED AT COMPLETED MILESTONE BOUNDARY FOR GPT-6 REVIEW.**
