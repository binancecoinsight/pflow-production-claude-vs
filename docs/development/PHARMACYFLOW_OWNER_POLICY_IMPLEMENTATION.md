# PharmacyFlow owner-policy implementation checkpoint

Date: 2026-10-23  
Source baseline: `main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`, plus preserved local work  
Owner decisions: APP-01 through APP-07

This checkpoint records local implementation and preparation only. It is not database, browser, deployment, or production evidence.

## Disposition

| Decision | Local result | Status | Remaining gate |
|---|---|---|---|
| APP-01 | Owner/staff paths are separated. M-16 acceptance is available to authenticated users, accepts its sealed SQL-shaped membership row without inventing a success flag, and fails closed on application, shape or membership errors. No role or tenant is client-selected. | IMPLEMENTED — UNVERIFIED | Forward-only verified-user OWNER and invitation-aware bootstrap designs require protected implementation approval and database acceptance. |
| APP-02 | UTC lifecycle mapping and capability containment preserve authorized history plus durable checkout review/recovery/acknowledgment while blocking new sale, inventory, refund/restock, customer, supplier, new-shift and enrollment mutations. Existing-shift reconciliation and device security/recovery retain existing role controls. | IMPLEMENTED — AWAITING INDEPENDENT REVIEW | The trusted-anchor, prior-plan, offline-evidence and operation-level enforcement design requires protected implementation approval. |
| APP-03 | Admin pharmacy reads use an explicit five-column allowlist; the adapter discards extra fields and privileged mutations remain absent/disabled. | IMPLEMENTED — AWAITING INDEPENDENT REVIEW | Verify the platform-admin read policy and projection on an approved target; no grants were added. |
| APP-04 | Additive status-v2 source and executable verification bundle remain authored and unexecuted. | IMPLEMENTED — UNVERIFIED | Database/PostgREST role and ownership cases require isolated-target authorization. |
| APP-05 | One PharmacyFlow-only disposable identity, exact loopback bindings, fixture scope, target guards, deterministic overlap barrier, abort rules and cleanup are specified. | BLOCKED — APPROVAL | Environment creation, Docker, SQL, migration, Edge and browser execution need exact owner authorization. |
| APP-06 | Changes remain unstaged. The scoped manifest and staging proposal are prepared for review. | BLOCKED — APPROVAL | Independent GPT-6 review, then owner approval before selective staging/commit. |
| APP-07 | A target-bound read-only Dev inspection procedure is prepared. | BLOCKED — APPROVAL | Exact credential/access method and read-only commands require owner authorization. |

## APP-01 onboarding findings

M-16 already enforces confirmed recipient email, hashed invitation token, tenant scope, role allowlist excluding OWNER, expiry, revocation/replay state, subscription seat eligibility and canonical locks. The client now exposes only invitation ID and token and never accepts a role parameter.

Its sealed success response is membership evidence, not a mandatory `success = true` envelope. The adapter accepts a valid active non-OWNER membership row, rejects `success = false` (including expired/revoked outcomes), and rejects missing or malformed identity, role or status evidence. The same form is reachable from the authenticated shell, so an existing membership does not strand an invitee; membership refresh preserves the selected tenant when it remains valid.

The sealed M-2 trigger automatically creates a pharmacy and OWNER membership during generic auth-user insertion. It runs before the approved verified-user server onboarding ceremony and cannot distinguish invited staff safely. Therefore:

- the old client call to `auth.signUp` has been removed from the active owner-registration action;
- the owner UI identifies itself as owner registration and reports the trusted service as unavailable;
- staff are directed to sign in with the confirmed invited email and accept the server invitation;
- no schema/RPC migration was authored in this batch.

Required forward-only design: one idempotent trusted operation must verify the authenticated/confirmed caller, accept no caller-selected owner role, atomically create pharmacy/main branch/subscription/OWNER membership, and return the existing tenant context. A separate invitation-aware auth bootstrap must avoid triggering OWNER creation for a new invited staff identity. Duplicate submissions must return the original authorized result or a typed conflict; partial tenant creation must roll back.

## APP-02 entitlement findings

The local mapper implements 14-day-policy-compatible recorded periods and an exact seven-day grace boundary in UTC. `TRIAL`, `ACTIVE`, and bounded `PAST_DUE` can permit UI mutations; `CANCELLED`, `EXPIRED`, missing/invalid evidence and `SUSPENDED` fail closed. This is usability containment only: the returned policy explicitly sets `authoritative: false`.

Containment is capability-level. Sales history and receipts, catalog inspection, durable checkout review/recovery and acknowledgment remain reachable. Creating/finalizing a new sale, catalog/stock/intake/adjustment/transfer mutations, and refund/restock initiation are disabled. After a restricted acknowledgment, POS clears retired evidence and does not call new-checkout reservation.

Customer and supplier mutations, new cash-shift opening, and device enrollment/key replacement are now explicitly contained as well. Historical directory/shift/device reads remain available. Closing a server-known existing shift and device block/unblock/decommission/recovery controls are kept distinct from creating new activity and continue to rely on their existing role/server authority. Delayed mutation and draft-retirement completions are invalidated on scope, entitlement and unmount changes.

The sealed M-3 helper recognizes only unexpired `TRIAL`/`ACTIVE`, and operational sale/inventory acceptance does not consistently establish entitlement using trusted server time. A forward-only proposal must define a non-resettable lifecycle anchor, prior-plan grace entitlement, signed/authoritative pre-expiry acceptance evidence for offline work, and enforcement in each mutation RPC/gateway. An unsigned client timestamp must never reopen entitlement.

## APP-03 metadata boundary

The operational Admin query now requests only `id,name,subscription_plan,subscription_expires_at,created_at`. Normalization preserves only those fields; unsupported fields are unavailable, extra source fields are discarded, and financial activity is not fabricated. Renewal, role, stock, sale, customer, refund, impersonation, suspension and subscription mutation controls remain outside the operational dashboard.

The protected contract proposals and operation-by-operation enforcement matrix are in `PHARMACYFLOW_FORWARD_CONTRACT_DESIGNS.md`. They are designs only and do not alter M-2, M-16, Refund V2 or another sealed contract.

## Local evidence

- `node --loader ./scripts/typescript-loader.mjs src/lib/auth/onboarding.test.ts` — 18 passed, including sealed M-16 SQL-shaped success, expired application rejection, malformed/inactive/OWNER evidence, exact arguments and no client role/tenant fields.
- `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/lifecycle.test.ts` — 13 passed, including the capability matrix.
- `node --loader ./scripts/typescript-loader.mjs src/lib/offline/phaseB.test.ts` — 59/59 passed, including restricted entry, durable recovery and no replacement after acknowledgment.
- `node scripts/acceptance/target-guard.test.mjs` — passed; invalid targets perform zero injected external calls and all runner/harness source guards pass.
- `node --loader ./scripts/typescript-loader.mjs apps/pharmacy-flow-admin/lib/dashboard-data-boundary.test.mjs` — 20 passed, 0 failed.
- `npm.cmd run lint` — TypeScript no-emit passed.
- `npm.cmd test` — 37 suites passed, 0 failed.

These are local static/synthetic checks. No auth provider, database, real browser, Docker, network or service was used.

## Security invariants

- No client-selected role can create OWNER through the new paths.
- Existing multi-pharmacy membership resolution is unchanged.
- M-16, sealed financial migrations, Refund V2, signatures, nonces and idempotency were not weakened.
- Expired/missing local entitlement does not delete data or stop recovery of already accepted operations.
- Admin displays no demo tenant and exposes no operational mutation.
- StoreFlow is permanently outside scope and was not accessed.
