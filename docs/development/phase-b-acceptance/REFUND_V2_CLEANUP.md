# Refund V2 elevated cleanup boundary

Status: **DOCUMENTED / UNEXECUTED / OWNER AUTHORIZATION REQUIRED**.

The existing Refund V2 concurrency harness uses committed rows because its independent PostgreSQL sessions must observe the same fixture. Its `finally` block always calls `Cleanup-Fixture`, and both setup recovery and cleanup connect as `supabase_admin` and transaction-locally set `session_replication_role` to `replica`.

That elevation is necessary because PharmacyFlow deliberately prevents ordinary deletion of `stock_ledger`, `audit_logs`, completed `sales` and `sale_items`. It also suppresses membership-audit and auth-user bootstrap triggers. It is not ordinary application cleanup and must be explicitly included in the acceptance authorization.

## Guardrails

- The runner first verifies the container/project label and expected local PostgreSQL endpoint.
- Cleanup is limited to pharmacy `81111111-1111-4111-8111-111111111111` named `Refund V2 concurrency harness` and user `81333333-3333-4333-8333-333333333333` with email `refund-v2-concurrency@test.local`.
- Any name/email mismatch aborts before deletion.
- Known child tables are deleted explicitly; there is no broad database reset or unconstrained cascade.
- `session_replication_role=replica` is scoped to the cleanup transaction/session. It disables both user and referential triggers, so the fixed predicates and ordered deletion list are safety-critical.
- The runner proves the fixture pharmacy/user root counts are zero afterward. The evidence run must additionally capture before/after non-fixture counts.
- If cleanup or identity proof fails, preserve the disposable target and stop. Do not rerun with weakened checks or improvise manual deletion.

An enclosing rollback transaction cannot replace this cleanup: concurrency sessions cannot see another session's uncommitted fixture, and the harness intentionally commits state before opening those sessions.
