# PF-MVP-10 executable acceptance-package handoff

Date: 2026-10-30
Status: runnable, unexecuted, ready for independent review

## Package

`scripts/acceptance/pf-mvp-10/` contains a pure authorization contract/preflight, injected orchestrator tests, fail-closed PowerShell preflight and executor, Supabase runtime compatibility gate, exact overload/private-base ACL assertions, transactional entitlement/replay/inventory assertions, bounded two-session intake concurrency with authoritative effect counts, owned-fixture cleanup and a deliberately non-authorizing example JSON.

The package requires real `auth.users`, `auth.uid()`, `auth.jwt()`, `anon`, `authenticated`, `service_role`, `auth`/`extensions` schemas and `pgcrypto`. It aborts if these are unavailable; it does not install or emulate them. Provider/Auth UI and browser/datastore scenarios remain excluded.

Preflight validates exact owner authorization, expiry, target identity, command/scenario set, permissions, manifest and `psql` hashes, credential/evidence paths, runtime contract and cancellation state before the first executor call. Migration application is filename-ordered through 000039. Evidence output is bounded/sanitized. Cleanup is package-fixture-only; environment destruction has no implementation and requires separate target-specific authority.

## Local checks

- Injected preflight/orchestration: pass, including zero calls on rejection/cancellation and sanitized failure propagation.
- Package static assertions: 24 passed.
- PowerShell parser: 3 files clean.
- SQL lexical structure: 7 files clean.
- Focused strict TypeScript: pass.
- Root no-emit TypeScript: pass.
- No database, SQL, RPC, Auth/provider, browser/datastore, network, Docker/service, credential, provisioning, Git or deployment operation was performed.

## Remaining authority

The exact unresolved decisions and commands are in `PHARMACYFLOW_PF-MVP-10_OWNER_EXECUTION_AUTHORIZATION_REQUEST.md`. Independent acceptance must precede owner execution authorization. AUTH-02 and direct-table enforcement remain separate gates.
