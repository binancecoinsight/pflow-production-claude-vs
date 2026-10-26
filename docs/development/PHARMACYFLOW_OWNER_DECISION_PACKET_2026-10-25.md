# PharmacyFlow decision and authorization packet

Checkpoint: **PF-SUP-2026-10-25-12**  
Status: **OWNER DECISIONS / SEPARATE AUTHORIZATIONS REQUIRED — NO EXECUTION AUTHORITY**

The 30-file correction snapshot has received scoped independent review. BLK-015–017 are corrected at source/synthetic level. This does not accept MVP, release, real-browser, Auth/PostgREST, SQL, concurrency, cleanup, deployment or production behavior. AUTH-02 remains **NOT RUN — OWNER DEFERRED** and is not requested by this packet.

## A. BLK-002 — bounded protected onboarding implementation proposal

Recommended smallest next implementation milestone: authorize **onboarding contract v1 only**, independently of entitlement, database execution, Git operations and deployment. It closes the earliest dependency in MVP-01 and can be reviewed synthetically before any migration is run.

Proposed contracts and files:

- Implement `rpc_create_pharmacy_owner_v1(p_request_id uuid, p_pharmacy_name text, p_currency text default 'NGN')` and its private request-reservation table in one new additive migration, proposed path `supabase/migrations/<approved_timestamp>_owner_onboarding_v1.sql`.
- Add a profile-only replacement bootstrap trigger in that same forward migration. Do not edit sealed M-2 or M-16.
- Preserve M-16 as the only signed-in invitation-consumption/membership step.
- Add the trusted invitation bootstrap boundary as a separately reviewable Edge file, proposed path `supabase/functions/staff-invitation-bootstrap/index.ts`; it may reserve and recover Auth-provider work but may not consume invitations or assign OWNER.
- Integrate only through `src/lib/auth/onboarding.ts`, `src/contexts/AuthContext.tsx`, `src/components/AuthScreen.tsx`, `src/components/StaffInvitationForm.tsx`, and their focused tests.

Preservation rules: no client-selected roles or trial anchors; no direct client OWNER/membership insert; exact request fingerprint/replay; atomic pharmacy/branch/subscription/OWNER creation; profile-only default trigger; trusted non-client-writable invitation marker; multi-pharmacy selection preserved; fixed `search_path`, dedicated non-login owner, least grants/RLS; no sealed migration or Refund V2/M-18/status-v2 change.

Required local synthetic review before any execution: exact/different-fingerprint replay; simultaneous reservation winner; rollback with zero orphan effects in a model; unconfirmed user; client metadata forgery; existing-member and new-user invitation paths; expired/revoked/accepted/OWNER invitation; Auth ambiguity/retry; cross-tenant transfer; response-shape validation. Then require independent authorization/security review. Migration execution, Auth-provider calls, database testing, Git and deployment remain separate approvals.

Owner authorization needed for this milestone: explicitly approve local authoring of the new migration and Edge contract plus the named client/test files. This must not be phrased as approval to execute, connect, stage, commit or deploy them.

## A2. BLK-003 — bounded server-entitlement implementation proposal

Keep this separate from onboarding. Proposed first protected source batch:

- One new additive migration, proposed path `supabase/migrations/<approved_timestamp>_entitlement_v1.sql`, defining immutable trusted anchors, append-only source evidence and `rpc_get_effective_entitlement_v1`.
- A versioned capability result with `TRIAL`, `ACTIVE`, `GRACE`, `EXPIRED` and conservative `UNKNOWN`; database UTC only; seven-day grace inheriting the prior plan.
- An explicit enforcement inventory covering M-18, inventory mutations, cash open/close, customer/supplier/staff mutations and Refund V2. Wiring any financial RPC or Edge gateway is a later separately reviewed sub-batch so preserved contracts are not changed implicitly.
- Client mapping limited to `src/lib/subscription/lifecycle.ts`, `src/lib/subscription/capabilities.ts`, `src/contexts/AuthContext.tsx` and focused synthetic tests; client checks remain advisory.

Preservation rules: exact previously accepted replay is checked before entitlement denial; first-seen post-expiry operations remain durable/quarantined; historical reads/recovery remain authorized by existing role/tenant/branch policy; no local clock authority; no M-18 or Refund V2 signature/response change; no sealed migration edits.

Synthetic gates: UTC trial/grace boundaries, no login/reinstall reset, prior-plan inheritance, malformed evidence -> `UNKNOWN`, exact accepted replay, first-seen denial, effect-free typed denial, tenant/branch denial and response-loss recovery. Independent security/financial review follows. SQL execution and operation-by-operation enforcement require later explicit approvals.

## B. Owner policy choices — proposals, not decisions

### BLK-004 commercial catalog

| Choice | Alternatives and consequence | Recommendation (proposal only) |
|---|---|---|
| Launch currencies | NGN-only minimizes tax/FX/rounding scope; multi-currency requires per-currency price versions and no implicit FX. | Start NGN-only; add currencies only through immutable price versions. |
| Billing periods | Monthly only is smallest; monthly + annual requires annual discount, renewal and proration rules. | Monthly first; keep annual inactive until its policy is selected. |
| Plan changes | Immediate prorated changes require credit/debit accounting; next-renewal changes are simpler. | Upgrades/downgrades at next renewal for MVP. |
| Taxes | Tax-exclusive/inclusive calculation needs jurisdiction and invoice rules; “not applicable” must be legally confirmed. | Keep activation blocked until an owner-approved tax treatment exists. |
| Failed payments | Automatic retry needs cadence and customer messaging; manual renewal is simpler. | Manual renewal during seven-day grace for MVP. |
| Refund/chargeback entitlement | Immediate shortening can remove already-used access; leave unchanged can create uncompensated access. | Append compensation and enter reconciliation; do not rewrite an active term automatically until approved. |

Owner must select each row before commercial activation. No prices or discounts are proposed here.

### BLK-005 referral credit

| Choice | Alternatives and consequence | Recommendation (proposal only) |
|---|---|---|
| Value basis | Currency credit is auditable; calendar entitlement month complicates annual plans/upgrades. | Immutable NGN minor-unit credit equal to the eligible monthly plan price at qualification. |
| Qualification/holding | Immediate settlement risks chargebacks; a hold reduces abuse but delays reward. | First verified qualifying settlement plus an explicitly selected holding period. Owner must choose the duration. |
| Aggregate cap | No cap raises abuse exposure; per-invoice caps do not constrain aggregate liability. | One award per referred organization/program plus an owner-selected annual aggregate cap. |
| Expiry | Never-expiring credit creates indefinite liability; expiry requires notices and ledger events. | Owner-selected fixed expiry recorded in the immutable policy snapshot. |
| Annual/discount use | Full unrestricted application complicates revenue allocation. | Apply as bounded invoice credit, never cash, transfer or implicit FX. |

Rewards remain inactive until every field is selected and protected implementation is separately authorized.

### BLK-013 offline eligibility

- Option 1: conservative first trusted server acceptance. A locally frozen but unseen post-expiry operation remains durable and requires renewal/support resolution.
- Option 2: server-signed bounded offline grants, requiring issuance, revocation, device binding, sequence/budget, clock-skew, theft and compromise policy plus protected proof.
- **Recommendation (proposal only): Option 1 for MVP.** It is smaller and avoids treating client time as entitlement evidence. Option 2 should be a later security design if offline commercial requirements demonstrate the need.

## C. BLK-009 dependency/lockfile repair authorization

Proposed bounded diagnostic batch:

1. Preserve the current dirty `package-lock.json` and hash it before work.
2. Read `package.json`/lockfile and run only non-installing diagnostics such as `npm.cmd ls --all --package-lock-only --ignore-scripts` and targeted `npm.cmd explain` commands.
3. Attribute the missing optional Tailwind oxide WASM entries and propose the smallest deterministic lockfile correction.
4. Do not edit application source, upgrade packages, change declared versions, run lifecycle scripts or install anything during diagnostics.

If correction cannot be made safely without package-manager resolution, request a second authorization naming the exact `npm install --package-lock-only --ignore-scripts` command, expected registry/network access and lockfile-only write. A normal dependency installation, cache cleanup, global change or package upgrade is excluded. Git staging/commit remains separate.

## D. AUTH-03 enforced read-only access method

Target remains PharmacyFlow-Dev `lqzsfsmppoaibnzczmhf`. An acceptable method must be technically unable to mutate or invoke privileged business functions—for example, a dedicated non-superuser PostgreSQL login with only `CONNECT`, catalog/information-schema reads and explicit `SELECT` on the migration ledger/approved metadata views, no schema `CREATE`, no table writes, no tenant-data grants, no financial RPC `EXECUTE`, and an enforced read-only transaction/session policy. Alternatively, use a reviewed metadata proxy whose allowlist exposes only the same fields. A write-capable service-role key, owner URL, unrestricted CLI login or broad management token is unacceptable even if the operator intends only reads.

Approved metadata scope: exact project identity; PostgreSQL version; ordered migration ledger names/hashes; relevant function signatures/owners/`search_path`/grants; RLS enablement and policy metadata; Edge Function names/versions/status without invocation; configuration-key presence booleans without values; sanitized recovery-readiness metadata. No tenant/customer rows, logs, secrets, function invocation or mutation.

Owner action: provide the enforced method and separately authorize the exact read-only commands. Do not send credentials in chat or store them in evidence.

## E. AUTH-02 disposition

**NOT RUN — OWNER DEFERRED.** This packet intentionally does not request disposable target creation, credentials, JWTs, services, ports, browser storage, SQL, concurrency, cleanup or any external acceptance operation.

## Proposed next bounded batch

After an explicit owner selection, the smallest dependency-ordered milestone is **BLK-002 onboarding contract v1 local authoring and synthetic tests only**. Keep entitlement authoring, database execution, Auth-provider execution, dependency repair, Git mutation and deployment as distinct later decisions. If BLK-002 is not selected, the only other immediately bounded local batch is BLK-009 read-only dependency diagnosis; it must not silently become installation or lockfile regeneration.
