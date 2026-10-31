# Future owner execution-authorization request — PF-MVP-10

No execution is authorized. Independent acceptance of the PF-SUP-2026-10-30-06 production-path integration manifest must occur first. A later authorization must supply:

1. disposable host, port, database, user, SSL mode, system identifier, database OID and the exact owner marker already stored as the database comment;
2. exact `psql` path/hash and a PowerShell Core 7 executable path/hash with an approved version in `[7.4.0,8.0.0)`;
3. out-of-repository credential-file delivery, authorization expiry and empty owned evidence destination;
4. the exact `scripts/acceptance/pf-mvp-10/PF-MVP-10_EXECUTION_INVENTORY.sha256` path and current SHA-256 `59338f5aee6d759ccb580c18e2e111f463c7f82cc5468b46473f3d20886e43ca`, containing all 41 active migrations through 000039 and all 20 current execution dependencies; historical review manifests are not executable inventories;
5. exact allowed commands and all nine scenarios;
6. `migrationApply`, `fixtureWrite`, `concurrency` and `fixtureCleanup` decisions independently—acceptance assertions require fixture writes;
7. permission for the disposable database comment marker to be read and for API-role/RLS/`pg_stat_activity`/`pg_locks` evidence to be inspected;
8. acknowledgement that `fixture-cleanup` only validates ownership/dependencies and returns an immutable-evidence preservation refusal; environment destruction is a distinct separately authorized operation with no automatic fallback.

Exact future commands are in `scripts/acceptance/pf-mvp-10/README.md`; each uses the owner-pinned `pwsh.exe`, quotes paths containing spaces, and names `scripts/acceptance/pf-mvp-10/PF-MVP-10_EXECUTION_INVENTORY.sha256`.

Unresolved owner-supplied values: target identity/marker, executable identities, credential delivery, evidence destination, expiry and all command/permission selections. AUTH-02, Auth/provider/browser cases, direct-table enforcement and environment destruction remain separate gates.
