# PharmacyFlow ACC-01 reservation/revocation concurrency source package

Date: 2026-10-26  
Baseline: owner-supplied independent checkpoint PF-SUP-2026-10-26-12  
Classification: local source/synthetic package; PostgreSQL acceptance not run

## Authorization and preservation

The owner authorized only the missing reservation/revocation concurrency scenario, its committed-fixture lifecycle, focused local verification, documentation and one new hash manifest. Migrations `000027`–`000032`, I3 application/security source, historical manifests and unrelated dirty/untracked work remain unchanged.

Database/SQL/fixture/cleanup execution, target inspection, Auth/provider/network, Docker/services/ports, credentials, browser storage, installation, Git mutation, provisioning, activation, deployment, environment destruction and StoreFlow were prohibited and did not occur. AUTH-02 remains deferred. REV-LIN-01 remains undecided.

## Existing production contract used

Source inspection found the required genuine shared lock in migration `000030`:

- `rpc_gateway_reserve_owner_eligibility_v1`, reached through the corrected v2 wrapper, acquires `pg_advisory_xact_lock(hashtextextended(email_digest, 1))` before reading the admission.
- `rpc_platform_owner_admission_decide_v1`, reached through the corrected v2 wrapper for `REVOKE`, acquires the identical email-digest lock before updating the admission.
- The reservation RPC requires the exact active admission/context/current decision. The revocation RPC requires the exact active predecessor.

This is static source evidence. PostgreSQL lock identity, ordering and behavior remain unexecuted.

## Authored lifecycle and orderings

Each ordering has a distinct email/digest and fixed identifiers. Its committed active admission is created through `rpc_platform_owner_admission_decide_v2('APPROVE', ...)`; setup refuses any pre-existing fixture identifier. No admission, decision, security-operation or eligibility row is directly inserted.

1. **Reservation first:** session A reserves through `rpc_gateway_reserve_owner_eligibility_v2` and holds the production email lock. Session B's admission revocation waits on that lock, then succeeds. Expected durable state: the request remains `RESERVED`; the admission is inactive at the new revocation decision. Counts: reservation `2`, revocation `3`, final `5`.
2. **Revocation first:** session A revokes the admission and holds the same production email lock. Session B's reservation waits, then must fail `PI010`. Expected durable state: inactive admission, no reservation security operation and no request. Counts: revocation `3`, rejected reservation `0`, final `3`.

Both cases require committed readiness from distinct backend IDs, the exact A-blocks-B relationship in `pg_blocking_pids` and `pg_locks`, unsigned lock components, bounded statement/lock/session waits, exact outcomes, outcome-specific counts, a final state predicate and scenario-specific cancellation rollback absence. The harness adds no advisory lock.

## Ownership and cleanup

The new fixture identifiers are part of the exact preflight fixture contract and digest. Successful setup and scenarios create immutable security/business evidence. `90_cleanup.sql` therefore refuses fixture cleanup when any corresponding admission, decision, operation or request exists; it never deletes that evidence or another run's rows. Environment destruction remains separate and unauthorized.

## Executed local verification

| Command | Exact result | Evidence class |
|---|---|---|
| `reservation-revocation.test.ps1` with process-scoped execution-policy bypass | exit 0; `ACC-01 reservation/revocation scenario source tests: passed` | Pure PowerShell/source generation |
| `node --experimental-strip-types scripts/acceptance/i3a/synthetic.test.ts` | exit 0; `ACC-01 reservation/revocation concurrency synthetic tests: passed (16 zero-executor preflight rejections; fixture inventory and case identifiers passed)` | Pure/injected |
| `node scripts/acceptance/i3a/static.test.mjs` | exit 0; `ACC-01 reservation/revocation concurrency source static tests: passed` | Static source assertions |
| `npm.cmd exec -- tsc -p scripts/acceptance/i3a/tsconfig.json --noEmit` | exit 0; no diagnostics | Focused strict compilation |
| PowerShell parser over harness `.ps1` sources | 11/11 `PARSE_OK` | Parser only |

No psql or acceptance executor was invoked.

## Remaining limitations

- Both new orderings are **AUTHORED — POSTGRESQL NOT RUN**. Lock overlap, transitions, counts, timeout/cancellation and rollback behavior are not accepted externally.
- Durable pending recovery concurrency remains **NOT IMPLEMENTED** because the recovery RPC exposes no observable application lock.
- Consumption/revocation and confirmed continuation remain **NOT IMPLEMENTED — AUTH SCOPE REQUIRED**.
- Provider feasibility remains open.
- REV-LIN-01 remains **POLICY BLOCKED / UNDECIDED**; this package concerns admission revocation and does not select an authority-revocation rule.
- AUTH-02 remains deferred. No execution, rollout or dependent-work authority is created.

## Handoff

Stop for independent review of the new scoped manifest. Any PostgreSQL execution requires a later authorization naming the exact reviewed manifest, disposable target, credential delivery, supported case subset, fixture/evidence permissions, cancellation and immutable-evidence/environment cleanup boundary.
