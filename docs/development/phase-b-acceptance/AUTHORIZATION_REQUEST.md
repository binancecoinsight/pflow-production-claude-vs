# Exact Phase B acceptance authorization request

This document is a request, not authorization. No listed operation may run until the owner approves it verbatim or issues an equally specific replacement.

Authorize one Phase B acceptance run against only this disposable local PharmacyFlow target:

- Supabase project ID/label: `pharmacyflow-mvp-acceptance-20261023`.
- PostgreSQL container/database: `supabase_db_pharmacyflow-mvp-acceptance-20261023` / `postgres`.
- Docker network/volumes: `supabase_network_pharmacyflow-mvp-acceptance-20261023`, `supabase_db_pharmacyflow-mvp-acceptance-20261023`, and `supabase_storage_pharmacyflow-mvp-acceptance-20261023`.
- Local endpoints: PostgreSQL `127.0.0.1:56322`; Supabase API/PostgREST/Edge gateway `http://127.0.0.1:56321`; Studio `127.0.0.1:56323`; mail `127.0.0.1:56324`; analytics `127.0.0.1:56327`; inspector `127.0.0.1:56328`; pooler `127.0.0.1:56329`; PharmacyFlow app `http://127.0.0.1:56300`.
- Browser executable/profile: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` with new isolated profile `C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-mvp-acceptance-20261023-browser`.
- Evidence directory: `C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-mvp-acceptance-20261023-evidence`.

Authorize Gates A-F only: status-v2 role/ownership/absence; M-18 replay/conflict/rollback/two-session concurrency and real gateway normalization; Refund V2 local/concurrency/Edge compatibility; real-browser IndexedDB upgrade/contention; restart/recovery; consecutive-customer receipt and branch/cashier/unmount lifecycle transitions.

Authorize these command groups after manifest/target preflight succeeds:

1. Create/start only the new disposable project above, then set `PF_ACCEPTANCE_TARGET_ID` and `PF_ACCEPTANCE_EXPECTED_TARGET_ID` to `pharmacyflow-mvp-acceptance-20261023`, `PF_ACCEPTANCE_DB_CONTAINER` to `supabase_db_pharmacyflow-mvp-acceptance-20261023`, `PF_ACCEPTANCE_EDGE_CONTAINER` to `supabase_edge_runtime_pharmacyflow-mvp-acceptance-20261023`, `PF_ACCEPTANCE_API_CONTAINER` to `supabase_kong_pharmacyflow-mvp-acceptance-20261023`, both `PF_ACCEPTANCE_DB_PORT` and `PF_ACCEPTANCE_EXPECTED_DB_PORT` to `56322`, and both `PF_ACCEPTANCE_API_URL` and `PF_ACCEPTANCE_EXPECTED_API_URL` to `http://127.0.0.1:56321`; verify exact labels, database, exact loopback bindings, network, volumes, branch/HEAD, source manifest and artifact manifest before any write. Supply `PF_ACCEPTANCE_SERVICE_ROLE_KEY`, `PF_ACCEPTANCE_ANON_KEY` and any database URL out of band in the current process only; never inspect containers for secrets or record credential values. For status-v2, also supply the owner-approved runner/migration SHA-256 values and eight distinct short-lived target-signed JWTs matching the fixed fixture subjects. The owner must name the issuance/signing method; authorization to read a JWT secret must not be inferred.
2. Clean-replay the reviewed ordered PharmacyFlow SQL migration set through `20261014000026_client_operation_status_v2.sql` only on this new target, recording hashes and the resulting ledger. Do not repair, modify or apply migrations anywhere else.
3. Run, in order, the five exact Gate A/B commands printed in `PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md`, then `node .\scripts\acceptance\status-v2-postgrest.mjs` with the reviewed hashes and tokens. Treat the SQL Gate A result as administrative characterization and the PostgREST result as the only grant/RLS/JWT evidence.

For the PF-SUP-2026-10-25-12 reviewed correction snapshot, the proposed values are `PF_ACCEPTANCE_APPROVED_STATUS_V2_RUNNER_SHA256=13f2344fe831aba67fbf2c94a8fe9884dd202651faeae7ce424ba019f8fe5cf9` and `PF_ACCEPTANCE_APPROVED_STATUS_V2_MIGRATION_SHA256=4ec722303800139e88e75e91bbc2d873dc70bc59a0a8870425a613adc5a6ca8f`. The earlier runner value `d44b5e0333c76f59aa2aef845b974e2fbf62eaf1ff3020577504ae3c6dfb9b90` is a historical pre-hardening snapshot and is not current. This proposal correction grants no execution authority. Any later source drift is an abort and requires a refreshed independent review and explicit authorization rather than changing values during execution.
4. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-refund-v2-local.ps1` and `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-refund-v2-concurrency.ps1`.
5. Run `node .\scripts\run-edge001-disposable.mjs`, `node .\scripts\run-edge002-disposable.mjs` and `node .\scripts\run-edge003-disposable.mjs` only after their target/environment guards pass, plus the exact local synthetic commands listed in the package.
6. Start/use only the named isolated local Supabase Docker services and `npm.cmd run dev` bound to `127.0.0.1:56300`; launch Edge with `Start-Process -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList @('--user-data-dir=C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-mvp-acceptance-20261023-browser','--disable-extensions','--no-first-run','http://127.0.0.1:56300')`; execute the real-browser runbook; inspect identity/logs; stop only processes started for this run.

Authorize only these writes:

- installation of the reviewed status-v2 function on the disposable database;
- fixed Gate A/B and Refund V2 synthetic fixture rows;
- M-18/Refund RPC nonce, journal, sale, return, item, stock, exception and audit effects required by the cases;
- IndexedDB records in the named isolated Edge profile;
- sanitized evidence files in the named evidence directory;
- transaction-local elevated `session_replication_role=replica` for fixed auth-user creation and identity-guarded cleanup of only the documented fixture UUIDs.
- bounded, unique `pf_acceptance_concurrency_barrier_<run-id>` objects containing only run/session/backend readiness evidence; the harness verifies the exact object comment and proves its database sessions stopped before dropping it.

Authorize cleanup using `scripts/phase-b-acceptance/gate-ab-cleanup.sql`, the Refund V2 runners' guarded `finally` cleanup (including its documented identity-guarded transaction-local `session_replication_role=replica` behavior), deletion of only the named isolated browser profile after evidence export and path verification, and stopping only services/processes started by this run. On identity mismatch or cleanup failure, stop and preserve the target. Deleting the disposable Docker project/network/volumes is not included and would require a later destructive-operation authorization.

Explicitly exclude the existing/original PharmacyFlow environments, deployment, production access, Git mutation, dependency installation, unrelated data mutation and all StoreFlow access. StoreFlow is permanently prohibited and cannot be included in this or any later authorization.
