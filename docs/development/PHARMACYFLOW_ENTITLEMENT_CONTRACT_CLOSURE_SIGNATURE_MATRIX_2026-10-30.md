# Entitlement contract closure composed signature matrix

| Public signature after 000039 | Preserved body | Guard | Final grant |
|---|---|---|---|
| `rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID)` | M-9 renamed base | authenticated operator; live entitlement only, no invented replay proof | `authenticated` |
| `rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT)` | M-10 renamed base from 000038 | authenticated operator; exact replay only with existing hash evidence | `authenticated` |
| `rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT)` | latest M-20/M-21..M-25 base from 000038 | exact gateway scope and committed replay | `service_role` |
| `rpc_commit_sale_v1(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB)` | latest M-18 base | exact gateway scope and committed replay | `service_role` |
| `rpc_ingest_sale_stock_movement(UUID,UUID,UUID,UUID,UUID,UUID,UUID,INT,TEXT)` | sealed M-6 effective base | exact gateway scope and committed replay | `service_role` |
| `rpc_receive_inventory_stock(UUID,UUID,JSONB,UUID,TEXT,TEXT,UUID)` | M-13 base | exact M-13 canonical fingerprint | `authenticated` |
| `rpc_adjust_inventory_stock(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,UUID,TEXT)` | M-14 base | exact M-14 canonical fingerprint | `authenticated` |
| `rpc_dispatch_stock_transfer(UUID,UUID,UUID,JSONB,UUID,TEXT)` | M-15 dispatch base | exact dispatch fingerprint | `authenticated` |
| `rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT)` | M-15 receive base | exact receive fingerprint | `authenticated` |
| six M-16 staff exact signatures | M-16 renamed bases | online entitlement; preserved invitation/member rules | `authenticated` |

All renamed bases and private resolver/fingerprint/evidence helpers are revoked from `PUBLIC`, `anon`, `authenticated` and `service_role`. Effective catalog resolution and ACL behavior remain pending PostgreSQL execution.
