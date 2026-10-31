# PF-MVP-09 composed migration and grant matrix — PF-SUP-2026-10-30-01

Date: 2026-10-30 (Africa/Lagos). Evidence class: static source composition only. PostgreSQL parsing/application, catalog resolution and grants are **NOT RUN**.

## Authoritative lineage disposition

Standard filename order is `000035` → `000036` → competing `20261029000037_consolidated_entitlement_enforcement_v1.sql` → foundation `20261030000037_entitlement_foundation_acceptance_completion_v1.sql`. The competing file has four lexical source-structure failures, including an unquoted `DO` body and malformed `AS $` delimiters. Normal migration application therefore stops at the competing file. The later foundation proposal is structurally clean but unreachable in a normal chronological run.

The only source-backed runnable lineage currently established is through `000036`. PF-MVP-09/R/S is a quarantined proposal, not an effective migration. Its report cites “PROPOSED OWNER AUTHORIZATION”; the current PF-SUP-2026-10-30-01 authority permits reconciliation and additive proposals, not editing/removing/renaming that migration or executing SQL.

## Effective sealed contracts before the blocked proposal

| Surface | Latest effective source composition | Exact signature | Effective source grant | Candidate 000037 disposition |
|---|---|---|---|---|
| M-6 sale stock ingestion | M-6 | `rpc_ingest_sale_stock_movement(UUID,UUID,UUID,UUID,UUID,UUID,UUID,INT,TEXT)` | `service_role` | Replacement proposed; gateway provenance remains role-claim based and is not accepted. |
| M-18 sale commit | M-18 | `rpc_commit_sale_v1(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB)` | `service_role` | Replacement drops nonce consumption, actor authorization and controlled-deficit path. Not parity. |
| Legacy return | M-10 | `rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT)` | `authenticated` | Remains a callable legacy surface. Candidate replacement is not accepted. |
| Refund V2 | M-20 composed with M-21 locking, M-22 item-lock/duplicate correction, M-23 replay ambiguity, M-24 device lookup grant and M-25 gateway-claim compatibility | `rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT)` | `service_role` | Candidate omits nonce consumption, allocation accounting, contract version/reconciliation guards, M-22 item locking and M-23 replay correction. Not parity. |
| Inventory intake | M-13 | `rpc_receive_inventory_stock(UUID,UUID,JSONB,UUID,TEXT,TEXT,UUID)` | `authenticated` | Candidate writes `RECEIVED`, which violates the sealed `COMPLETED/PENDING/CANCELLED` constraint and accepted `COMPLETED` response contract. |
| Inventory adjustment | M-14 | `rpc_adjust_inventory_stock(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,UUID,TEXT)` | `authenticated` | Candidate retains some arithmetic/idempotency checks but uses non-exact grant statements; not accepted as a replacement. |
| Transfer dispatch | M-15 | `rpc_dispatch_stock_transfer(UUID,UUID,UUID,JSONB,UUID,TEXT)` | `authenticated` | Candidate loses the sealed permission path and uses non-exact grants. |
| Transfer receive | M-15 | `rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT)` | `authenticated` | Candidate retains lifecycle/idempotency fragments but loses the sealed permission path and uses non-exact grants. |
| Staff invitation create | M-16 | `rpc_create_staff_invitation(UUID,UUID,TEXT,VARCHAR)` | `authenticated` | Candidate body exists; entitlement replacement is not accepted while chain/parity is unresolved. |
| Staff invitation accept | M-16 | `rpc_accept_staff_invitation(UUID,TEXT)` | `authenticated` | Candidate uses non-exact grants; lifecycle parity not established. |
| Staff invitation revoke | M-16 | `rpc_revoke_staff_invitation(UUID)` | `authenticated` | Candidate uses non-exact grants; lifecycle parity not established. |
| Staff role change | M-16 | `rpc_change_member_role(UUID,UUID,VARCHAR)` | `authenticated` | Candidate uses non-exact grants. |
| Staff reactivate | M-16 | `rpc_reactivate_pharmacy_member(UUID,UUID)` | `authenticated` | Candidate uses non-exact grants. |
| Staff suspend | M-16 | `rpc_suspend_pharmacy_member(UUID,UUID)` | `authenticated` | Candidate uses non-exact grants. |

## Foundation and direct-table disposition

| Surface | Status | Evidence / gap |
|---|---|---|
| `rpc_get_effective_entitlement_v2(UUID)` | Authored, unreachable | Structurally clean later foundation file; intended grant `authenticated`. Blocked behind malformed competing 000037. |
| Trusted committed evidence producer | Authored, unwired | No sale/refund/inventory business transaction calls `record_committed_entitlement_operation_v2`; atomic producer parity is unimplemented. |
| Exact replay proof | Authored private proposal | No application-role grant; no final business consumer wiring. |
| Products/catalog | Direct-table mutation gap | Existing `.from('products')` mutation paths are not server-entitlement enforced. |
| Customers | Direct-table mutation gap | Existing `.from('customers')` mutations remain RLS/table paths. |
| Suppliers | Direct-table mutation gap | Existing `.from('suppliers')` mutations remain RLS/table paths. |
| Devices | Direct-table mutation gap | Existing `.from('devices')` enrollment/mutation paths remain unwired. |
| Cash/staff recovery | Policy-sensitive | Recovery/read paths must remain available; mutation gating requires a separately accepted wrapper/trigger design. |

## Readiness conclusion

Implemented enforcement remains the sealed pre-entitlement contracts and existing RLS/grants. Foundation v2 and trusted evidence are authored proposals only. PF-MVP-09/R/S route enforcement is unresolved protected work. The repository is **not PostgreSQL-parser ready, migration-application ready or disposable-test ready**.
