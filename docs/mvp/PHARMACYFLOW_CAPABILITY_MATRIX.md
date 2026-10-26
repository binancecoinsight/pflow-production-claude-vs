# PharmacyFlow MVP capability matrix

## PF-SUP-2026-10-25-11 local correction overlay

Capability-level subscription containment remains advisory client enforcement, not authoritative server entitlement. The production async boundaries for customer, supplier, device and cash mutations now clear their busy indicators whenever tenant/branch/user scope or entitlement eligibility changes; delayed completions remain rejected by generation. Focused scope/expiry/renewal tests are local synthetic evidence only. Historical reads and durable checkout recovery/acknowledgment remain available according to their existing capability policy; no protected Refund V2 or server contract changed.

Status-v2 acceptance preparation now requires a target-bound anon JWT and eight target-bound, short-lived authenticated JWTs. Local JWT parsing establishes claim shape only (`DECODED_UNVERIFIED_PREFLIGHT`); it does not establish signature provenance. Real grants, RLS, signature verification and authorization remain **NOT RUN — OWNER DEFERRED** under AUTH-02.

Baseline: 2026-10-23. Status terms follow the five-milestone directive. `VERIFIED COMPLETE` is reserved for evidence adequate to the capability's risk; green local tests alone do not satisfy database/browser/deployment gates.

PF-SUP-2026-10-23-08 preserves M1 as a completed inventory, not an acceptance claim. Every row retains its implementation/evidence status and maps through `PHARMACYFLOW_MVP_ROADMAP.md` to the older development roadmap.

| Capability | Status | Concrete evidence | Gap or acceptance dependency |
|---|---|---|---|
| Authentication session lifecycle | IMPLEMENTED BUT UNVERIFIED | `src/App.tsx`; `src/contexts/AuthContext.tsx` | Password recovery and real auth/browser acceptance remain open. |
| Multi-pharmacy membership/selection | IMPLEMENTED BUT UNVERIFIED | `src/contexts/AuthContext.tsx:116-183`; `src/components/SelectPharmacyScreen.tsx` | Revocation, restoration, cross-tenant and branch cases need target evidence. |
| Owner onboarding | PARTIALLY IMPLEMENTED | `src/components/AuthScreen.tsx`; `src/lib/auth/onboarding.ts`; M-2 | Unsafe client OWNER selection is contained; atomic verified-user server contract is design-only. |
| Staff invitation acceptance | IMPLEMENTED BUT UNVERIFIED | `src/components/StaffInvitationForm.tsx`; `src/lib/auth/onboarding.ts`; sealed M-16 | SQL-shaped synthetic cases exist; real expiry/replay/tenant/seat enforcement is unverified. |
| Role-aware navigation | PARTIALLY IMPLEMENTED | `src/components/AuthenticatedShell.tsx`; M-2 permissions | Some view gating exists; full operation/role/branch matrix is not executed. |
| Product/catalog management | IMPLEMENTED BUT UNVERIFIED | `src/lib/inventory/service.ts`; `src/lib/inventory/catalog.test.ts`; inventory UI | Database/RLS/branch reconciliation pending. |
| Batch intake and expiry | IMPLEMENTED BUT UNVERIFIED | inventory M-5/M-13; `src/lib/inventory/expiry.ts`; intake tests | Database stock ledger and expiry UX acceptance pending. |
| Adjustments and transfers | IMPLEMENTED BUT UNVERIFIED | M-14/M-15; `stockAdjustment.test.ts`; `stockTransfer.test.ts` | Concurrent/branch-isolated database effects pending. |
| Suppliers and purchase receipts | IMPLEMENTED BUT UNVERIFIED | `src/lib/suppliers/`; `src/components/suppliers/`; M-13 | Authoritative target verification and expiry capability boundary pending. |
| Customer management | IMPLEMENTED BUT UNVERIFIED | `src/lib/customers/`; `src/components/customers/CustomersView.tsx` | Target authorization and real UI delayed-completion acceptance pending. |
| POS durable checkout | IMPLEMENTED BUT UNVERIFIED | `src/lib/pos/`; `src/components/pos/`; `src/lib/offline/phaseB.test.ts` | Real browser contention/restart and SQL commit evidence pending. |
| Unified sale/payment commit | IMPLEMENTED BUT UNVERIFIED | M-18; `supabase/functions/sync-push-sale/`; `src/lib/sales/` | PostgreSQL replay/conflict/rollback/concurrency and deployed gateway acceptance pending. |
| Offline queue/signing/nonce | IMPLEMENTED BUT UNVERIFIED | `src/lib/offline/`; `src/lib/crypto/`; M-4/M-6 | Real browser, service, expired-auth/device and database evidence pending. |
| Outcome reconciliation/status v2 | IMPLEMENTED BUT UNVERIFIED | `src/lib/offline/protocol.ts`; unexecuted `20261014000026_client_operation_status_v2.sql` | Migration, RLS/role/ownership matrix, and authorized absence require database approval. |
| Refund V2 | IMPLEMENTED BUT UNVERIFIED | `src/lib/sales/refundV2.ts`; return-v2 Edge function; M-20..M-25 | Preserve contracts; current-tree DB/Edge/concurrency evidence and independent review pending. |
| Cash shifts/reconciliation | IMPLEMENTED BUT UNVERIFIED | `src/lib/cash/`; `src/components/cash/CashReconciliationView.tsx` | Target effects, branch/role transitions, and expiry behavior need acceptance. |
| Reports/owner dashboards | IMPLEMENTED BUT UNVERIFIED | `src/lib/reports/`; `src/components/reports/`; report tests | Refund-adjusted authoritative reconciliation, pagination, and access evidence pending. |
| Device lifecycle | IMPLEMENTED BUT UNVERIFIED | `src/lib/devices/`; `src/components/devices/`; M-4 | Enrollment/security operations need target and role evidence. |
| Subscription UI/lifecycle containment | IMPLEMENTED BUT UNVERIFIED | `src/lib/subscription/lifecycle.ts`; `capabilityBoundary.ts`; wired components | Advisory only; server time and operation-level enforcement absent. |
| Configurable plan catalog | PARTIALLY IMPLEMENTED | sealed M-3 has basic columns; forward design in `docs/mvp/PHARMACYFLOW_COMMERCIAL_ARCHITECTURE.md` | No runtime billing period/effective version/history model; COM-01 prices/policies unresolved. |
| Paystack/provider billing | BLOCKED BY EXECUTION AUTHORIZATION | No active integration; provider-independent/Paystack design is recorded locally | Protected server implementation, credentials, provider sandbox and activation require separate approvals. |
| Referral attribution/credit ledger | BLOCKED BY OWNER DECISION | Only disconnected fixtures exist; forward organization/credit-ledger design is recorded locally | Valuation/qualification/cap/expiry decisions precede protected implementation; issuance stays inactive. |
| Admin Support read-only metadata | IMPLEMENTED BUT UNVERIFIED | `apps/pharmacy-flow-admin/components/Dashboard.tsx`; `lib/admin-data-readiness.ts` | Platform-admin policy/projection must be verified on an approved target. |
| Admin privileged mutations | BLOCKED BY OWNER DECISION | APP-03 explicitly prohibits MVP privileged mutations | Must remain absent/disabled. This is a policy boundary, not a missing MVP feature. |
| Audit logging | IMPLEMENTED BUT UNVERIFIED | M-6 audit schema plus financial migrations | Coverage/immutability/actor provenance need approved database review. |
| Browser deployment | IMPLEMENTED BUT UNVERIFIED | Vite/server configuration; prior local builds reported | No current hosted target or browser compatibility evidence. |
| Android/Capacitor | PARTIALLY IMPLEMENTED | Capacitor material exists only in a noncanonical reference application tree | Canonical integration and Android build/device evidence absent. |
| Backup/recovery/observability | PARTIALLY IMPLEMENTED | sanitized gateway errors and `PHARMACYFLOW_DEPLOYMENT_RECOVERY_PLAN.md` | Infrastructure, alerts, backup evidence, and rehearsal remain authorization-gated. |
| Disposable acceptance environment | BLOCKED BY EXECUTION AUTHORIZATION | existing Phase B package plus `docs/mvp/PHARMACYFLOW_DISPOSABLE_TEST_AUTHORIZATION.md` | Owner must approve exact identity, commands, writes, services, browser profile, and cleanup. |
| Git release snapshot | BLOCKED BY EXECUTION AUTHORIZATION | scoped manifests and `PHARMACYFLOW_RELEASE_STAGING_PROPOSAL.md` | Independent review and owner approval precede selective staging/commit. |
| Signed offline entitlement grant | BLOCKED BY OWNER DECISION | alternative design at `docs/development/PHARMACYFLOW_FORWARD_CONTRACT_DESIGNS.md:56` | No issuance/revocation/budget/device proof; conservative first-server-acceptance remains. |
| POS busy-state recovery | IMPLEMENTED BUT UNVERIFIED | `PosView.tsx:113-169,380-409`; `drafts.ts:49-81`; synthetic Phase B cases | Actual React/unmount/scope/aborted-IDB behavior awaits real-browser evidence. |
| Authenticated status-v2 authorization evidence | IMPLEMENTED BUT UNVERIFIED | `scripts/acceptance/status-v2-postgrest.mjs` and its 23-case matrix; synthetic guard/assertion tests | Real target-signed tokens, PostgREST grants/RLS and responses remain NOT RUN under AUTH-02. |
| Edge acceptance cleanup | IMPLEMENTED BUT UNVERIFIED | `scripts/acceptance/edge-fixture-cleanup.mjs`; all three Edge disposable runners; injected synthetic cleanup tests | Identity guards/failure cleanup/zero-root parsing pass locally; actual Auth/database cleanup remains NOT RUN and requires exact disposable authorization. |

## Milestone roll-up

- M1 baseline: `COMPLETE` for local static reconciliation, subject to incremental review.
- M2 core SaaS: `PARTIAL`; most workflows are implemented but high-risk database/browser acceptance is blocked.
- M3 offline/transaction integrity: `PARTIAL`; local corrections exist, protected acceptance is not run.
- M4 admin/onboarding/subscriptions/referrals: `PARTIAL`; Admin/client containment exists, protected commercial contracts are missing or design-only.
- M5 release preparation: `PARTIAL`; evidence/manifests/runbooks exist, critical acceptance and deployment remain unauthorized.
