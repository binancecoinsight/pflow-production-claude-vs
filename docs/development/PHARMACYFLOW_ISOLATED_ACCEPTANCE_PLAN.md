# PharmacyFlow isolated acceptance environment proposal

Status: **UNEXECUTED — OWNER AUTHORIZATION REQUIRED**

## Proposed exact identity

- Supabase project ID/label: `pharmacyflow-mvp-acceptance-20261023`
- PostgreSQL container: `supabase_db_pharmacyflow-mvp-acceptance-20261023`
- Edge runtime container: `supabase_edge_runtime_pharmacyflow-mvp-acceptance-20261023`
- API gateway container: `supabase_kong_pharmacyflow-mvp-acceptance-20261023`
- Database: `postgres`
- Docker network: `supabase_network_pharmacyflow-mvp-acceptance-20261023`
- Database volume: `supabase_db_pharmacyflow-mvp-acceptance-20261023`
- Storage volume: `supabase_storage_pharmacyflow-mvp-acceptance-20261023`
- Host bindings: API `127.0.0.1:56321`, PostgreSQL `127.0.0.1:56322`, Studio `127.0.0.1:56323`, mail `127.0.0.1:56324`, analytics `127.0.0.1:56327`, inspector `127.0.0.1:56328`, pooler `127.0.0.1:56329`
- Application: `127.0.0.1:56300`
- Browser profile: `C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-mvp-acceptance-20261023-browser`
- Evidence directory: `C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-mvp-acceptance-20261023-evidence`

These identifiers are proposals, not existing-resource claims. Creation, probing and use are not authorized.

## Migration set

Apply a clean ordered replay of the 28 SQL files from `20261003000000_foundation_v1.sql` through the unexecuted `20261014000026_client_operation_status_v2.sql`. Do not edit or skip sealed migrations. Record SHA-256 before execution and record the migration ledger afterward.

## Isolation and abort rules

Before any write, positively match the exact project label on the database, Edge runtime and API gateway containers, the database, exact `127.0.0.1` database/API bindings, network and volume names above. Confirm the target is newly disposable and contains no non-fixture tenant. Credentials must be current-process inputs only and must never be printed, persisted in evidence or recovered by inspecting a container. Abort on any mismatch, pre-existing unknown data, source/hash drift, unexpected service, port conflict, cleanup-guard mismatch, or any StoreFlow/original-PharmacyFlow identity. Never probe StoreFlow to prove isolation.

## Fixtures and execution

Use only the fixed Gate A/B identities and Refund V2 fixtures in the Phase B bundle. Cross-session concurrency fixtures must be committed to this disposable target; an enclosing rollback transaction is insufficient because the second session cannot observe uncommitted setup. Two-session acceptance requires both sessions to commit readiness, expose distinct PostgreSQL backend IDs, wait at a bounded release barrier, overlap, emit exactly one parseable expected result each, and satisfy explicit rollback/effect assertions. Delayed startup or sequential completion is a failed concurrency case. Run status-v2 role/ownership/authorized-absence, M-18 replay/conflict/rollback/two-session concurrency, Refund V2 compatibility, IndexedDB upgrade/contention/restart/recovery, and consecutive-customer/receipt/branch/cashier lifecycle cases.

## Cleanup

Use only identity-guarded fixture cleanup documented in the bundle. Elevated Refund V2 cleanup may temporarily set `session_replication_role=replica` only inside the reviewed cleanup transaction, only after fixed UUID/name/hash guards pass, and must restore the setting before commit. If cleanup fails, stop, preserve evidence and the disposable target, and request direction. Environment deletion is a separate destructive authorization.

## Exact authorization dependency

Owner authorization must name this identity, every port/service, Gate A–F command group, status-v2 migration execution, committed fixture writes, elevated cleanup behavior, isolated browser profile, evidence location and process/service cleanup. It must not include StoreFlow, the original PharmacyFlow environment, production, deployment or Git mutation.
