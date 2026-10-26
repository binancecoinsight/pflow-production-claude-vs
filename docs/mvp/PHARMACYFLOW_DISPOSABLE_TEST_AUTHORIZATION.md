# PharmacyFlow disposable test authorization proposal

**Status:** PROPOSAL ONLY — UNEXECUTED — OWNER APPROVAL REQUIRED

This document satisfies TEST-01 planning. It does not authorize environment creation, Docker, ports, database access, migrations, fixtures, browsers, services, credentials, cleanup, or any other protected operation.

AUTH-02 disposition at PF-SUP-2026-10-23-08: **NOT RUN — OWNER DEFERRED**. This proposal is retained for review and must not be interpreted as a renewed execution request.

## 1. Exact proposed disposable identity

- Project ID/label: `pharmacyflow-mvp-acceptance-20261023`
- Database/container: `postgres` / `supabase_db_pharmacyflow-mvp-acceptance-20261023`
- Edge/API containers: `supabase_edge_runtime_pharmacyflow-mvp-acceptance-20261023` and `supabase_kong_pharmacyflow-mvp-acceptance-20261023`
- Network: `supabase_network_pharmacyflow-mvp-acceptance-20261023`
- Volumes: `supabase_db_pharmacyflow-mvp-acceptance-20261023`, `supabase_storage_pharmacyflow-mvp-acceptance-20261023`
- Browser profile: `C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-mvp-acceptance-20261023-browser`
- Evidence directory: `C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-mvp-acceptance-20261023-evidence`

These are proposed new resources, not claims that they exist.

## 2. Services and exact loopback bindings

| Service | Permitted binding |
|---|---|
| PharmacyFlow app | `http://127.0.0.1:56300` |
| Supabase API/PostgREST/Edge gateway | `http://127.0.0.1:56321` |
| PostgreSQL | `127.0.0.1:56322` |
| Studio | `127.0.0.1:56323` |
| Mail | `127.0.0.1:56324` |
| Analytics | `127.0.0.1:56327` |
| Inspector | `127.0.0.1:56328` |
| Pooler | `127.0.0.1:56329` |

Any wildcard/non-loopback binding or conflict is an abort. Only the named containers, network, volumes, services, and processes may be started/stopped after authorization.

## 3. Database and migration scope

- Only the exact disposable database above may be connected.
- Replay the 28 reviewed SQL files in filename order from `20261003000000_foundation_v1.sql` through the unexecuted `20261014000026_client_operation_status_v2.sql`.
- Record SHA-256 values before execution and the resulting migration ledger afterward. Do not edit, skip, repair, or apply the chain elsewhere.
- Allowed fixtures are only the fixed Gate A/B and Refund V2 identities/rows documented by `docs/development/phase-b-acceptance/FIXTURES.json` and the reviewed runner sources.
- Cross-session M-18, Refund V2, and browser cases require committed fixtures. An enclosing setup rollback cannot qualify because independent sessions cannot observe uncommitted rows.

## 4. Credential boundary

Use only credentials issued for this disposable target and only with the least privilege required by each step. Database URL, anon key, service-role key, JWTs, and administrative database credentials must be supplied out of band into the current process, never printed, placed in arguments, written to evidence/source, recovered by container inspection, or reused for another target. Clear process variables after the run.

The status-v2 PostgREST command additionally requires `PF_ACCEPTANCE_APPROVED_STATUS_V2_RUNNER_SHA256`, `PF_ACCEPTANCE_APPROVED_STATUS_V2_MIGRATION_SHA256`, one target-bound anon JWT in `PF_ACCEPTANCE_ANON_KEY`, and eight short-lived JWT variables: `PF_STATUS_V2_TOKEN_OWNER_A`, `...MANAGER_A`, `...PHARMACIST_A`, `...CASHIER_A`, `...CASHIER_B`, `...INACTIVE_A`, `...CASHIER_TENANT_B`, and `...CASHIER_C`. Actor tokens must have no more than a 15-minute `iat`/`exp` lifetime. All tokens must bind the exact target reference, audience and issuer. Their values are secret runtime inputs, never command-line literals or evidence. The local runner decodes claims only and labels that provenance unverified; it does not verify a signature. A future separately approved run must rely on the approved target gateway's signature verification and include an altered-signature negative control plus issuance attestation. This preparation authorizes neither key retrieval nor token minting.

The fixed fixture UUIDs are test data, not credentials. Elevated `supabase_admin` behavior is limited to the reviewed fixture setup/cleanup that requires transaction-local `session_replication_role=replica`; it is not allowed for ordinary assertions.

## 5. Authorized test scope requested

- Gate A: status-v2 role, membership, ownership, branch, inaccessible-record, legacy/incomplete evidence, tenant denial, and authorized-absence matrix.
- Gate B: M-18 exact replay, changed-hash conflict, checkout conflict, unknown unique sanitization, rollback, deterministic two-session overlap, and exact financial/stock effects.
- Gate C: Refund V2 exact replay, changed-hash rollback, over-return concurrency, allocation, inventory restoration, nonce/journal, Edge V2, and unchanged V1 compatibility.
- Gates D–F: real React components in the named isolated browser profile; IndexedDB v3-to-v4 preservation, initialization/lease contention, abort-after-request, restart/recovery, customer/receipt/branch/cashier transitions, delayed customer creation, barcode/search/duplicate selection, checkout replacement, scope changes, and unmount.
- Local synthetic/static precursors listed in `docs/development/PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md`.

No production data, unrelated tenant, payment activation, referral reward, deployment, Git mutation, or dependency installation is included.

### Evidence-class correction for Gate A/B

The current referenced runners prove different things and must remain separately labeled:

| Runner/path | Actual session/role | Permitted future evidence label | Does not prove |
|---|---|---|---|
| `gate-a-assertions.sql` through `docker exec ... psql -U postgres` | Administrative PostgreSQL session; sets `request.jwt.claim.role/sub` transaction-locally | `REAL-DB ADMIN-HARNESS CHARACTERIZATION` | `anon`/`authenticated` EXECUTE grants, connection-role behavior, RLS through PostgREST, genuine JWT validation, HTTP absence/error shape |
| `gate-b-sequential.sql` and `gate-b-concurrency.ps1` | PostgreSQL `postgres`; claim role is `service_role` | `REAL-DB SERVICE-HARNESS CHARACTERIZATION` | Browser/user authorization, PostgREST grants/RLS, Edge normalization except where a separate Edge request is made |
| `run-edge001/002/003-disposable.mjs` | Real Auth sessions/JWTs plus direct administrative fixture/state SQL | `REAL-EDGE AUTHENTICATED REQUEST` for their Refund V2 cases | status-v2 Gate A, M-18 sale-gateway cases, production deployment; cleanup remains unverified until executed |
| `scripts/acceptance/status-v2-postgrest.mjs` | Real anonymous request and separately supplied, target-signed tokens for fixed ACTIVE/INACTIVE OWNER/MANAGER/PHARMACIST/CASHIER subjects | `REAL-POSTGREST AUTH/RLS/GRANT` only after execution | Auth issuance/login, deployment, or production behavior |

The status-v2 PostgREST runner is locally prepared but unexecuted. It rejects opaque, secret/service-role, wrong-target, wrong-issuer, overlong and expired inputs before external access; bounds each HTTP request and rejects redirects outside the exact approved origin. Its 23 scenarios bind outer, record and nested effect identities plus operation-specific timestamps and provenance. Fully injected success is synthetic orchestration only. Administrative claim simulation and locally decoded JWT claims cannot be promoted to signature, grant or RLS acceptance.

## 6. Exact command groups requested

After source/target/port/container/network/volume/credential preflight, authorize these existing reviewed commands; do not rewrite guards during execution:

```powershell
Get-Content -Raw -LiteralPath '.\scripts\phase-b-acceptance\gate-ab-fixture.sql' | docker exec -i $env:PF_ACCEPTANCE_DB_CONTAINER psql -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1
Get-Content -Raw -LiteralPath '.\scripts\phase-b-acceptance\gate-a-assertions.sql' | docker exec -i $env:PF_ACCEPTANCE_DB_CONTAINER psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
Get-Content -Raw -LiteralPath '.\scripts\phase-b-acceptance\gate-b-sequential.sql' | docker exec -i $env:PF_ACCEPTANCE_DB_CONTAINER psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\phase-b-acceptance\gate-b-concurrency.ps1'
Get-Content -Raw -LiteralPath '.\scripts\phase-b-acceptance\gate-ab-cleanup.sql' | docker exec -i $env:PF_ACCEPTANCE_DB_CONTAINER psql -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\run-refund-v2-local.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\run-refund-v2-concurrency.ps1'
node .\scripts\run-edge001-disposable.mjs
node .\scripts\run-edge002-disposable.mjs
node .\scripts\run-edge003-disposable.mjs
node .\scripts\acceptance\status-v2-postgrest.mjs
```

Also authorize `npm.cmd run dev` bound only to `127.0.0.1:56300` and launching Microsoft Edge only with the exact isolated `--user-data-dir` above for the reviewed browser runbook. Environment creation/start and clean migration replay commands must be enumerated verbatim in the eventual approval before use; this proposal does not invent them without inspecting the selected runtime tooling.

The five Gate A/B SQL commands above authorize administrative/service harness characterization only. A later authorization must separately name `status-v2-postgrest.mjs`, its approved source hashes, disposable anon key, and eight target-signed fixed-subject JWTs before grant/RLS acceptance can run. Tokens must be supplied out of band, must never be printed or written to evidence, and must be expired/revoked or the disposable target destroyed under separately approved cleanup. Do not substitute `psql -U postgres` for that evidence.

## 7. Required deterministic evidence

- Target/container/network/volume names, exact loopback bindings, database identity, PostgreSQL/Supabase/Edge/browser/Node/npm/OS versions, branch/HEAD, migration/function hashes, source/artifact manifest results, and UTC timings.
- Sanitized raw command output, SQLSTATE/constraint classifications, exact parsed results, before/after rows and counts, nonce/journal/financial/stock/audit effects, and rollback proof.
- For concurrency: two distinct PostgreSQL backend IDs, committed readiness, bounded release barrier, both named RPC sessions simultaneously active, a relevant PostgreSQL lock wait before completion, exactly one parseable result per session, exact aggregate effects, and zero surviving sessions before barrier cleanup. Readiness alone, delayed startup, or sequential execution fails.
- For browser: DOM-visible production-component state, accessibility names, network counts, checkout/scope IDs, IndexedDB exports, screenshots/traces, and isolated-profile proof.
- Independent reviewer disposition for every case. Green synthetic tests do not promote a case to REAL-DB or REAL-BROWSER.

## 8. Cleanup and rollback

- Single-session negative/characterization cases use reviewed `BEGIN`/`ROLLBACK` and prove unchanged counts/checksums.
- Committed Gate A/B fixtures use `scripts/phase-b-acceptance/gate-ab-cleanup.sql`, constrained to fixed IDs/names/hashes with zero-root proof.
- Refund V2 runners use their guarded `finally` cleanup. The cleanup may use `session_replication_role=replica` only transaction-locally, only as `supabase_admin`, only after exact disposable-target and fixture-identity guards, and must restore it before commit. This elevated behavior bypasses immutable triggers and therefore must be named in the approval and evidenced.
- Exact runner qualification: `run-refund-v2-local.ps1` wraps its SQL fixture in rollback; `run-refund-v2-concurrency.ps1` verifies one fixed pharmacy name and auth-user email, uses a short-lived `supabase_admin` session with `session_replication_role=replica`, and proves those two roots are absent afterward. It does not prove a global target cleanup. `gate-ab-cleanup.sql` verifies the fixed Gate A/B pharmacy/user identities, deletes only their documented graph under transaction-local elevation, restores `origin`, and checks fixed roots afterward.
- The three Edge disposable runners now call `preserveFailureThroughCleanup` and the shared `runGuardedEdgeCleanup`. Cleanup records explicit fixture pharmacies, unique Auth emails/returned IDs, and deterministic names for every trigger-created bootstrap pharmacy; aborts on identity mismatch; deletes only the derived fixture graph under transaction-local `session_replication_role=replica`; restores `origin`; and parses a zero-root proof. EDGE-002 creates its own initial committed return before replay/conflict tests. These are locally inspected/synthetic claims only: the runners and cleanup SQL remain unexecuted and must fail the gate if cleanup or proof fails.
- Export browser evidence, close the run's tabs/process, resolve and verify the exact profile path, then delete only that isolated profile if deletion is explicitly approved.
- Stop only services/processes started for this run. On mismatch or cleanup failure, stop, preserve evidence and the disposable target, and request owner direction.
- Deleting the disposable project, network, or volumes is excluded and requires a later destructive-operation authorization.

## 9. Data safety and hard aborts

Abort before access or further mutation on source/manifest/hash drift; non-`main` branch or wrong HEAD; missing/ambiguous/shared/nonempty target; wrong database/container/network/volume; unexpected or non-loopback binding; port conflict; credential-scope mismatch; browser-profile reuse; fixture collision; unexpected migration/function/version; tenant leakage; unauthorized disclosure; duplicate/partial financial or stock effects; malformed outcome; inability to prove overlap/rollback; surviving sessions; cleanup uncertainty; or any source change after preflight.

StoreFlow and original/shared PharmacyFlow resources are permanently excluded. Do not probe StoreFlow to establish isolation.

## 10. Exact owner authorization required

The owner must explicitly authorize, in one message, the exact disposable identity and all named containers/network/volumes; every loopback service/port; environment creation/start commands; the 28-file migration replay including status-v2; the Gate A–F, Refund V2, Edge, synthetic, app, and browser command groups; the named credentials/roles supplied out of band; committed fixture and expected application writes; transaction-local elevated Refund V2/setup/cleanup behavior; the exact browser executable/profile and datastore/network use; sanitized evidence writes to the named directory; guarded fixture/profile/process cleanup; and evidence retention. The authorization must explicitly exclude StoreFlow, original/shared PharmacyFlow targets, production, deployment, dependency installation, Git mutation, and destructive environment deletion.
