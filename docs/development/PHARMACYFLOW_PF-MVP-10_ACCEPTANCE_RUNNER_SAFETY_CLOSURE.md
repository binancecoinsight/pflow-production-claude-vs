# PF-MVP-10 acceptance runner safety and evidence closure

Date: 2026-10-30
Checkpoint addressed: PF-SUP-2026-10-30-05
Status: local harness correction complete; protected execution not run; independent review required

## Corrected boundaries

- TypeScript and PowerShell now share command-specific authority: migration apply, fixture-write acceptance, fixture-write plus concurrency, and separately gated cleanup. Injected regressions prove every missing required permission causes zero executor calls.
- Every mutating command first verifies PowerShell/psql/package hashes, Supabase runtime, PostgreSQL system identifier, database OID and the owner marker stored as the database comment. Migration application additionally requires an empty target; later commands require verified 000039 state.
- Fixed fixtures refuse pre-existing UUIDs. Persistent concurrency fixtures carry authorization-ID and marker ownership. Cleanup requires four exact ownership records, UUID+email binding and exact dependency counts before deletion.
- Transactional intake uses valid commercial periods. Forced evidence failure checks exact SQLSTATE/message at the evidence trigger and compares purchases, items, batches, stock ledger, audit log and entitlement evidence before/after.
- Executable SQL now covers exact public/private ACLs, API roles and direct-write RLS denial, operator/tenant/branch boundaries, suspension/reinstatement/future/grace decisions, canonical intake retries, expired intake replay, Refund V2 replay/conflict/financial effects and atomic evidence failure.
- Concurrency waits for distinct backend readiness, proves worker two is blocked by worker one using `pg_blocking_pids`, validates exact terminal results/effects and stops every worker in catch/finally. Abort verification accepts only fully rolled-back or fully coherent committed state.
- Production invocation uses `.NET ProcessStartInfo.ArgumentList`; PowerShell Core 7.4–7.x and its executable hash are pinned. Output is live-bounded, sanitized before evidence retention and strictly framed. Injected PowerShell tests cover stdout, stderr/NOTICE, malformed framing, nonzero exit, timeout, cancellation, overflow, unaccounted lifecycle and secrets.

## Local evidence

Injected TypeScript preflight/orchestration passed; injected PowerShell process-boundary cases `11 passed`; package static `41 passed`; PowerShell `5 files clean`; C# compiled; SQL lexical `14 files clean`; focused and root TypeScript no-emit passed. PostgreSQL parsing/execution and all protected operations remain NOT RUN.

Unsupported cases remain explicit: Auth/provider lifecycle, browser/datastore behavior, direct-table enforcement policy, environment destruction and deployment. They are not represented as successful acceptance.

## File disposition

Application/security source and migrations 000000–000039 were not modified. The correction is confined to `scripts/acceptance/pf-mvp-10`, its focused TypeScript registration/configuration, this handoff and the current roadmap/progress/decision/blocker/evidence/approval summaries. Historical manifests remain unchanged.
