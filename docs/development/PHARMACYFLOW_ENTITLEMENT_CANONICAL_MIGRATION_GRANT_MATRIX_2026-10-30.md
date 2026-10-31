# Canonical entitlement migration and grant matrix

| Public entrypoint | Latest sealed base preserved | Guard / replay | Final execute role |
|---|---|---|---|
| `rpc_ingest_sale_stock_movement(UUID,UUID,UUID,UUID,UUID,UUID,UUID,INT,TEXT)` | renamed in migration 38 | service gateway; exact scoped replay | `service_role` |
| `rpc_commit_sale_v1(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB)` | M-18 effective definition renamed | service gateway; exact scoped replay | `service_role` |
| `rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT)` | latest M-20 + M-21..M-25 definition renamed | service gateway; exact scoped replay | `service_role` |
| `rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT)` | legacy sealed definition renamed | authenticated operator; replay only with supplied exact evidence | `authenticated` |
| `rpc_receive_inventory_stock(UUID,UUID,JSONB,UUID,TEXT,TEXT,UUID)` | M-13 definition renamed | authenticated operator; exact scoped replay where client op exists | `authenticated` |
| `rpc_adjust_inventory_stock(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,UUID,TEXT)` | M-14 definition renamed | authenticated operator; exact scoped replay | `authenticated` |
| `rpc_dispatch_stock_transfer(UUID,UUID,UUID,JSONB,UUID,TEXT)` | M-15 definition renamed | authenticated operator; source-branch exact replay | `authenticated` |
| `rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT)` | M-15 definition renamed | authenticated operator; destination-branch exact replay | `authenticated` |
| staff create/accept/revoke/change/reactivate/suspend exact M-16 signatures | M-16 definitions renamed | online entitlement check; no invented replay | `authenticated` |

All `_entitlement_base` functions are revoked from `PUBLIC`, `anon`, `authenticated` and `service_role`; they are reachable only through owner-executed wrapper delegation. Private guard/evidence helpers are likewise revoked from API roles.

Direct-table mutation paths are not represented as protected by this matrix. PostgreSQL catalog resolution, actual effective grants, dependency validity and runtime behavior remain unverified until separately authorized execution.
