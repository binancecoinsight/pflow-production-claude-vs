# PharmacyFlow deployment and recovery plan

Status: **PLANNING ONLY — NOT EXECUTED OR AUTHORIZED**  
Dev target for future compatibility inspection: `lqzsfsmppoaibnzczmhf`

## Local-to-Dev compatibility matrix

| Surface | Local reviewed expectation | Dev evidence | Fail-closed disposition |
|---|---|---|---|
| PostgreSQL/runtime | PostgreSQL major 17 selected locally | **BLOCKED — ACCESS METHOD** | Stop before migration planning if version differs or is unknown. |
| Migration ledger | Ordered sealed migrations plus additive status-v2 proposal | **BLOCKED — ACCESS METHOD** | Stop on missing, reordered, repaired or hash-divergent history. |
| Auth/onboarding | Sealed M-16 plus forward design; no new protected implementation | Not inspected | Keep client OWNER creation unavailable; invitation failures remain closed. |
| M-18 sale commit | Existing sealed signature/idempotency contract | Not inspected | Do not deploy dependent client/Edge changes on definition/grant drift. |
| Refund V2 | M-20–M-25 signatures/contracts preserved | Not inspected | Do not deploy on signature, owner, grant or Edge route drift. |
| status-v2 | Additive migration authored locally, unexecuted | Unknown/assume absent | Missing RPC produces UNKNOWN/recovery-required behavior; never authorized absence or resend. |
| Edge functions | Reviewed local sale/return gateways | Not inspected | Client remains conservative; no fabricated commit. |
| Client storage | IndexedDB v4 additive upgrade | Real browser **NOT RUN — OWNER DEFERRED** | Preserve older stores; abort release on upgrade/data-loss evidence. |

## Ordered future deployment

1. Independently review the release-candidate hash manifest and protected designs.
2. Under separate AUTH-02 authorization, create the named isolated disposable target and run the reviewed SQL/PostgREST/concurrency/Edge/browser acceptance bundle there. This is a hard prerequisite to any Dev rollout.
3. Independently review the disposable evidence and stop on any failed assertion, target/source mismatch, cleanup ambiguity, or surviving fixture root.
4. Perform the restricted Dev metadata inspection only after AUTH-03 has an enforced read-only method.
5. Reconcile exact project identity, PostgreSQL version, migration ledger, RPC definitions/owners/grants, Edge versions and non-secret configuration presence against the disposable-accepted snapshot.
6. Under separate deployment authorization, back up and record recovery identifiers; apply only reviewed additive forward migrations in ledger order. Never edit/replay sealed history.
7. Verify grants/RLS/function definitions before enabling dependent Edge code.
8. Deploy Edge gateways in compatibility order while old clients remain safe.
9. Deploy the client only after database and Edge compatibility evidence passes.
10. Execute post-deployment smoke specifications and monitor before broader availability.

Disposable acceptance is evidence about the reviewed snapshot, not permission to inspect or change Dev. AUTH-03 remains **BLOCKED — ACCESS METHOD**, and every Dev write/deployment step remains separately unauthorized.

## Configuration names

Presence-only checks; never record values:

- client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`;
- sale/return Edge: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY` where the reviewed function requires it;
- deployment tooling: exact project binding/ref and a separately authorized credential scope.

Missing, duplicated, unexpected or write-capable inspection credentials are abort conditions. No secret may appear in a command transcript, manifest or evidence bundle.

## Forward-only recovery

- Stop rollout on any ledger, owner, grant, signature, response-shape or tenant-isolation mismatch.
- Do not down-migrate or rewrite financial migration history. Preserve database/Edge/client evidence and current service state.
- If an additive migration fails transactionally, confirm no ledger entry/effect before retry. If it commits partially or compatibility is uncertain, disable dependent rollout and prepare a reviewed additive compensating migration.
- Keep old clients conservative when status-v2 is absent: status lookup failure remains UNKNOWN/RECOVERY_REQUIRED and automatic resend remains disabled.
- Never repair financial records manually or automate legacy completion. Reconcile by stable operation/hash identity through reviewed procedures.
- Client rollback may revert presentation code only when it remains compatible with the deployed additive schema; it must not rewrite IndexedDB frozen evidence.

## Post-deployment smoke specifications

Collect sanitized evidence for authentication/tenant selection, M-16 rejection/success, advisory entitlement messaging, authorized historical reads, one isolated new-sale exact replay, status-v2 denied visibility versus authorized absence, Refund V2 compatibility, IndexedDB upgrade/restart, consecutive-customer receipts, branch/cashier transitions and recovery acknowledgment without replacement. Abort on false commit, unknown-to-absence conversion, duplicate effect, cross-tenant visibility, altered receipt identity or schema drift.

## Monitoring and incident response

Monitor sanitized counts/rates for gateway denial codes, UNKNOWN/recovery-required queues, checkout conflicts, nonce/hash conflicts, migration/Edge version mismatch, device authorization failures and client storage upgrade failures. Do not log payloads, customer data, JWTs, signatures or secrets. On a financial/security signal: halt rollout, preserve immutable evidence, disable dependent feature exposure if possible without data mutation, identify the exact version/operation IDs, and escalate for independent review and owner-authorized recovery.
