# PharmacyFlow configurable billing and referral architecture

PF-SUP-2026-10-25-11 local specification closure adds the normative monotonic settlement table, stable compensation identity/fingerprints, cumulative reversal bounds, ambiguity-held credit reservations and one global resource-lock hierarchy. The executable model is specification evidence only; no provider, billing, database or PostgreSQL concurrency authority was implemented or exercised.

**Status:** DESIGN FOR OWNER AND INDEPENDENT REVIEW — NOT IMPLEMENTED, EXECUTED, OR ACTIVATED

Policy basis: COM-01, COM-02, COM-03, APP-02, and APP-03. This design does not modify sealed M-3, grant privileges, create a migration, connect to Paystack, issue credit, change entitlement, or enable dormant Admin controls.

Checkpoint reconciliation: PF-SUP-2026-10-23-08 tightens this design. The executable files under `scripts/specification/` are specification models only; none of the constraints below exists as database or billing runtime authority.

## Current-state reconciliation

- Sealed M-3 (`supabase/migrations/20261004000003_m3_billing_subscriptions.sql`) provides one mutable row per pharmacy, a simple plan table, generic payment/payment-event tables, client-read RLS, and revoked client mutations. It has no price-version history, billing-period catalog, invoice snapshot, provider abstraction, referral attribution, credit ledger, or chargeback entitlement workflow.
- `src/lib/subscription/lifecycle.ts` implements advisory APP-02 display/capability containment. It is not billing or server authorization.
- The active Admin route (`apps/pharmacy-flow-admin/app/page.tsx`) renders the minimal `Dashboard.tsx`. Older components and `lib/mock-data.ts` contain fixed prices, cash payouts, direct renewal/suspension concepts, and fabricated payment/referral records. Those disconnected artifacts are not authoritative, conflict with COM-01/02 and APP-03, and must remain unreachable. They should be removed or quarantined only in a separately reviewed cleanup because other dirty work is present.
- No active Paystack SDK/API/webhook integration or referral accounting runtime was found in the canonical SaaS, Admin route, or Edge functions.

## Domain boundaries

```text
Plan catalog/version -> quoted invoice -> provider payment attempt/event
                                      -> reconciled settlement
                                      -> subscription entitlement event
                                      -> authoritative entitlement projection

Referral attribution -> verified qualifying settlement -> immutable reward award
                                                   -> subscription-credit ledger
                                                   -> invoice credit allocation
```

Payment status is evidence about money movement; it is never itself entitlement authority. Entitlement changes are produced only by a trusted, idempotent reconciliation transaction that references immutable commercial evidence.

## COM-01 — configurable plan and price model

### Proposed additive records

| Record | Required immutable or controlled fields | Invariant |
|---|---|---|
| `billing_plans` | stable `plan_code`, display name, lifecycle state | Code is stable; client cannot mutate. |
| `billing_plan_versions` | version ID, plan code, effective-from/to, branch/staff limits, feature entitlement JSON, trial/grace policy version | Published version is immutable; time ranges cannot overlap for a plan. |
| `billing_prices` | version ID, ISO currency, `MONTHLY`/`ANNUAL`, amount in integer minor units, effective range, tax policy reference | One effective price per version/currency/period/instant; never floating point. |
| `billing_quotes` | pharmacy, selected price/version, quantity/limits, subtotal/tax/credit/total snapshots, currency, expiry, request fingerprint | Server-produced, time-bounded, immutable after use; replay returns the same quote. |
| `billing_invoices` | invoice number, pharmacy, plan/price/version snapshots, period, amounts, status, timestamps | Historical amount and entitlements never change when catalog prices change. |
| `subscription_terms` | pharmacy, plan version, entitlement start/end, prior plan, source invoice/event, transition reason | Server-authoritative UTC anchors; exact source event is unique. |
| `subscription_events` | append-only transition, before/after state, actor/source, source event ID, correlation ID | No in-place history rewrite; duplicate source is effect-free replay. |

Existing M-3 identifiers and readable projections should be preserved by a forward compatibility adapter. A forward migration would backfill conservative version snapshots without altering M-3 history. Unknown legacy price provenance must be marked `LEGACY_UNVERIFIED`, not assigned a fabricated catalog price.

### Quote and lifecycle rules

1. The client requests a quote using pharmacy, desired plan, billing period, and currency; it never submits an authoritative amount, entitlement end, discount, or role.
2. The server selects one effective plan/price version by trusted UTC and tenant eligibility, snapshots every amount/limit/feature, applies only approved credits, and stores a canonical request fingerprint/result.
3. Exact replay returns the quote. Reusing an idempotency key with different inputs is a typed conflict.
4. The payment attempt references the quote. Settlement reconciliation references the immutable attempt, provider event, and invoice.
5. A unique settlement source event produces at most one entitlement event. Trial/grace anchors follow the approved entitlement contract; login, reinstall, local time, webhook replay, or invoice display never extends them.
6. Upgrade/downgrade proration, annual discount, tax, refund effect, currency switching, and plan-limit enforcement remain configurable policies and cannot be inferred from fixture data.

## COM-03 — provider-independent billing interface

### Identity layers and compatibility

The following identities are separate and must never be collapsed:

| Identity | Meaning | Required uniqueness |
|---|---|---|
| `delivery_id` | One provider webhook delivery/event envelope | `UNIQUE(provider, delivery_id)` with immutable raw-body digest; nullable for polling |
| `provider_transaction_id` | Provider's canonical charge/transaction identity | Preserve M-3 `UNIQUE(provider, provider_transaction_id)`; a forward table may reference, not weaken, this key |
| `payment_attempt_id` | PharmacyFlow's stable attempt/reservation | `UNIQUE(pharmacy_id, request_id)` and `UNIQUE(provider, provider_transaction_id)` once bound |
| `invoice_id` | One immutable commercial obligation | At most one successful fulfillment source: `UNIQUE(invoice_id) WHERE fulfillment_state='FULFILLED'` or equivalent reservation row |
| `settlement_source_id` | Canonical normalized settlement evidence | `UNIQUE(provider, provider_transaction_id, settlement_version)`; later events update state through append-only evidence, not a second settlement |
| `entitlement_source_id` | One application of the invoice to entitlement | `UNIQUE(invoice_id)` and `UNIQUE(source_event_id)` |

Different webhook event IDs and polling responses may describe the same provider transaction. Deduplicating only by event ID is insufficient; every path converges under the canonical `(provider, provider_transaction_id)` lock before invoice fulfillment.

### Trusted interface

```ts
interface BillingProviderAdapter {
  createCheckout(input: TrustedCheckoutInput): Promise<ProviderCheckoutReference>;
  verifyTransaction(reference: string): Promise<NormalizedProviderTransaction>;
  verifyWebhook(rawBody: Uint8Array, headers: ReadonlyHeaders): VerifiedProviderEvent;
  fetchTransaction(reference: string): Promise<NormalizedProviderTransaction>;
}
```

The domain service receives only normalized provider evidence. Paystack-specific fields, URLs, signatures, secret keys, and event names stop at the adapter boundary. Secrets are server-only and obtained from the approved deployment secret store; none enter browser bundles, logs, evidence, source, or database payload snapshots.

### Initiation contract

Proposed trusted operation: `billing_create_checkout_v1(request_id, quote_id, return_context)`.

- Requires an authenticated authorized pharmacy billing actor and a valid unexpired server quote for that tenant.
- Reserves a unique `(pharmacy_id, request_id)` fingerprint before provider contact.
- Provider timeout/ambiguity leaves `PROVIDER_CONFIRMATION_REQUIRED`; retry verifies/fetches the same provider reference and never creates a second attempt blindly.
- Returns only a short-lived provider checkout URL/reference and local attempt ID. Browser completion is advisory and cannot activate entitlement.

### Webhook and reconciliation contract

1. Receive raw request bytes on a server-only endpoint; enforce size/content-type and provider source controls without treating IP as identity.
2. Verify Paystack's signature over the untouched raw body before parsing or storing a sanitized event.
3. Reserve unique `(provider, provider_event_id)` and immutable payload digest. Same event/digest is replay; same ID/different digest is a security conflict.
4. Never trust event metadata alone. Match provider customer/transaction, currency, amount, quote, invoice, and tenant using server-known references; fetch/verify with Paystack where the event is insufficient.
5. In one database transaction, record normalized settlement evidence, update the payment attempt/invoice, allocate approved credits, append the subscription event, and update the entitlement projection. Any mismatch is quarantined for reconciliation with no entitlement extension.
6. Out-of-order events use a monotonic state machine. A later-looking browser callback or duplicate webhook cannot move a terminal/refunded/chargeback record backward.

### Reservation, locking, and one-time fulfillment

For webhook, polling, retry, operator reconciliation, credit expiry, refund, and chargeback, every transaction uses this global resource order:

`canonical transaction -> payment attempt -> invoice -> credit account -> credit reservation -> referral award -> subscription term/projection`

Delivery/event identity is an idempotency reservation, not the canonical transaction identity. Reserve `(provider, delivery_id, body_digest)` when present before resource locking. Exact delivery/digest replay is effect-free; the same delivery ID with a changed digest is `EVIDENCE_CONFLICT`. Different deliveries and polling may still identify the same canonical `(provider, provider_transaction_id)`.

1. Reserve or lock the canonical provider transaction row. Compare a versioned fingerprint over pharmacy, payment attempt, quote, invoice, currency, amount, provider customer/reference, and contract version.
2. Lock only the resources needed by the path, always as an ordered subsequence of the global hierarchy. Settlement uses canonical transaction -> payment attempt -> invoice -> credit account -> credit reservation -> subscription term. Credit reservation uses invoice -> credit account -> credit reservation. Expiry uses canonical transaction -> invoice -> credit account -> credit reservation. Refund/chargeback uses canonical transaction -> payment attempt -> invoice -> credit account -> credit reservation -> referral award -> subscription term.
3. If a later lookup discovers that an earlier-ranked resource is required, roll back and retry from the start; never acquire it out of order. Pre-lock discovery reads are non-locking and cannot authorize an effect.
4. Verify invoice is unfulfilled or already fulfilled by this exact canonical transaction. Another transaction identity is `INVOICE_ALREADY_FULFILLED_CONFLICT`, not a second application.
5. Insert the unique fulfillment event and unique entitlement-source event in the same transaction. Update the entitlement projection only from that event. Commit payment evidence, credit consumption, invoice fulfillment, and entitlement application atomically.
6. Exact re-entry returns the stored canonical result. The response never depends on which delivery path won.

A missing reservation after a provider timeout is not proof that no provider transaction exists. `PROVIDER_CONFIRMATION_REQUIRED` stores the attempt/reference and blocks creation of another provider request until a bounded poll/reconciliation process proves absence under provider rules. If absence cannot be proven, the outcome remains ambiguous and no second charge or entitlement is created.

Refund and chargeback processing appends compensation events tied to the original fulfillment; it never deletes or mutates the original settlement, invoice snapshot, award, credit consumption, or entitlement event. Each compensation has a stable provider compensation ID and immutable fingerprint. An exact replay is effect-free, changed evidence for the same ID conflicts, and the cumulative compensated amount cannot exceed the canonical settled amount.

### Provider-neutral states

The normative monotonic transition table is:

| Current | Evidence | Result |
|---|---|---|
| `PENDING_PROVIDER` | pending | `PENDING_PROVIDER` replay |
| `PENDING_PROVIDER` | settled | `SETTLED` and eligible for one-time fulfillment |
| `PENDING_PROVIDER` | refund/chargeback | terminal compensation state; never fulfill later |
| `SETTLED` | pending/settled | no regression; exact evidence replays |
| `SETTLED` | refund | `PARTIALLY_REFUNDED` or `REFUNDED`, cumulatively bounded |
| `SETTLED` | chargeback | `CHARGEBACK`, cumulatively bounded |
| `PARTIALLY_REFUNDED` | pending/settled | no regression or revival |
| `PARTIALLY_REFUNDED` | refund/chargeback | append bounded compensation |
| `REFUNDED` | pending/settled | terminal replay; no fulfillment or entitlement revival |
| `CHARGEBACK` | pending/settled/refund | terminal replay; no revival |

`FAILED`, `EXPIRED`, `CANCELLED`, `RECONCILIATION_REQUIRED`, and `EVIDENCE_CONFLICT` are explicit. `AUTHORIZED` is used only if the provider supplies a trustworthy nonsettled authorization state; it grants no entitlement.

Refunds and chargebacks append compensating billing/credit/subscription events. They never delete original payment or reward evidence. The owner must approve whether and when a reversed payment shortens an already active paid term; until decided, mark `RECONCILIATION_REQUIRED` and do not fabricate a new entitlement end.

## COM-02 — organization referral and subscription-credit ledger

### Proposed records

| Record | Purpose and invariant |
|---|---|
| `referral_codes` | Stable random code owned by one pharmacy organization; revocable; no sensitive identifiers embedded. |
| `referral_attributions` | Referrer pharmacy, referred pharmacy, code, trusted captured-at, acquisition channel/version; one qualifying attribution per referred organization. |
| `referral_qualification_events` | References the referred pharmacy's verified first qualifying paid settlement and policy version. Unique settlement/policy pair prevents double qualification. |
| `referral_reward_awards` | Immutable award decision, referrer, qualification, value basis, policy version, state, reversal link. No cash-withdrawal semantics. |
| `subscription_credit_entries` | Append-only integer-minor-unit or explicit entitlement-unit debit/credit entries with source award/invoice/reversal and running-balance projection. |
| `invoice_credit_allocations` | Exact ledger entries applied to an invoice; cannot exceed eligible invoice amount or create a negative invoice. |

### Qualification sequence

1. Capture referral before or during trusted onboarding using a server-validated code. A user/pharmacy cannot attribute itself; common ownership/payment/device/risk signals may require review.
2. Do not qualify on signup, trial creation, checkout initiation, authorization, or unverified browser success.
3. Qualify only after the referred pharmacy is a genuinely new organization and its approved paid invoice reaches verified `SETTLED` under the configured holding/chargeback policy.
4. A unique qualification reservation locks the settlement and policy version. Exact replay returns the original award; changed evidence is a conflict.
5. Credit is issued to the referring pharmacy organization, never directly to a person. It cannot be withdrawn as cash or transferred cross-tenant.
6. Refund/chargeback adds a linked reversal entry up to the unused award. If already consumed, the account is flagged for bounded future-credit recovery/review; no negative cash invoice or silent historical rewrite is allowed.

### Credit ownership and aggregate lifecycle

A credit account is owned by exactly one pharmacy tenant and one asset dimension:

- currency credit: `(pharmacy_id, asset_kind='CURRENCY', iso_currency)` in integer minor units; or
- entitlement credit: `(pharmacy_id, asset_kind='ENTITLEMENT_UNIT', unit_code)` in integer units with a separately approved meaning.

Currency and entitlement units never share a balance. Currency credit never crosses tenant or ISO currency, and no implicit foreign-exchange conversion is permitted. Any future FX conversion requires an explicit quoted conversion event, rate source, rounding rule, and owner-approved accounting policy.

The append-only ledger projects these states per account:

- `AVAILABLE`: granted, unexpired amount not reserved or consumed;
- `RESERVED`: amount exclusively held by a quote/invoice checkout reservation;
- `CONSUMED`: amount atomically applied to one fulfilled invoice;
- `REVERSED`: invalidated award/credit linked to a refund, chargeback, fraud decision, or correction;
- `RECOVERY_DUE`: already-consumed credit that was later reversed and cannot be silently removed from history.

Required aggregate invariant for one account is enforced under an account-row lock, not by per-invoice caps:

`available + reserved + consumed_not_reversed = valid_grants - expired_unused - prior_recoveries`

Every ledger entry has a unique source/fingerprint and balanced state transition. The projection is rebuildable from entries and checked after each mutation. Concurrent quotes lock the account, reserve only from `AVAILABLE`, and use `UNIQUE(account_id, reservation_id)` plus `UNIQUE(invoice_id, credit_account_id)`; only one can reserve the final balance.

A reservation stores tenant, asset, quote/invoice, amount, policy/version, created/expires timestamps, and fingerprint. Exact replay returns the reservation. Changed input conflicts. Expiry changes `RESERVED -> AVAILABLE` only while no canonical provider transaction is settled or ambiguous. If provider outcome is ambiguous, reservation becomes `HELD_FOR_RECONCILIATION`; a timer cannot release it. A late settlement after a proven release cannot silently reconsume the balance: invoice fulfillment enters `CREDIT_RECONCILIATION_REQUIRED`, preserves settlement evidence, and applies no credit or entitlement until a locked resolution proves funding.

Refund/chargeback and expiry workers use ordered subsequences of the global hierarchy above; they do not use a separate account-first order. Reversal consumes unused `AVAILABLE` first only when tied to the exact award; it cancels a still-active reservation only after authoritative absence is proven. Provider ambiguity changes the reservation to `HELD_FOR_RECONCILIATION`, and neither TTL expiry nor a worker may release it blindly. A stable resolution ID/fingerprint records authoritative absence before release; exact replay is effect-free and changed evidence conflicts. Reversal of consumed credit has its own stable compensation ID/fingerprint, is cumulatively bounded, and appends `REVERSED` plus `RECOVERY_DUE`; it never makes another invoice negative, steals another tenant/currency balance, or edits the consumed entry.

The local synchronous `Map` model checks transition, replay, cumulative-bound, ownership, and lock-order specifications only. It is not evidence of PostgreSQL locking, overlap, isolation, or concurrency behavior; those remain external disposable-target acceptance under AUTH-02.

### Referral uniqueness and deterministic qualification

The award identity is `(program_id, referred_pharmacy_id)`, not policy version or payment ID. A unique reservation on that pair guarantees at most one qualifying organization/program award across policy revisions and multiple settlements.

At attribution, store an immutable policy snapshot ID and the referrer/referred organization identities. Later qualification callers cannot choose a policy version. After the configured holding rule is satisfied, the server selects from all eligible verified settlements using `(settled_at ASC, provider ASC, provider_transaction_id ASC)`. This deterministic first settlement is stored on the reservation before award creation. Concurrent workers either complete that reservation or exact-replay its result; a worker presenting a different organization, settlement set, or fingerprint receives a conflict.

The award snapshots every rule needed to explain the result, including valuation method, holding rule, cap, expiry rule, annual-plan interaction, source invoice/settlement, currency/unit, and policy version. Those policy values remain explicitly unresolved until the owner decides them. A later policy version cannot create a second award or rewrite the snapshot.

A qualifying settlement reversal appends a compensation linked to both award and source settlement. Unconsumed credit is reversed in its account; reserved credit follows the ambiguity rules above; consumed credit becomes recovery due. Requalification on a later settlement is forbidden unless a future owner-approved program explicitly defines a new award identity.

### Meaning of “one month”

The owner must select one configurable valuation rule before implementation:

- Recommended: credit equal to the then-current monthly price of the referrer's eligible plan/currency at qualification, capped at the next eligible invoice subtotal and stored as an immutable minor-unit award.
- Alternative: one calendar entitlement month appended after the current paid term, which complicates annual plans, upgrades, grace, refunds, and proration.

Until selected, `referral_reward_awards` must support a policy/version and remain `PENDING_POLICY`; issuance stays inactive.

## Authorization and data-access boundary

- Ordinary SaaS clients may read only their tenant's sanitized catalog, quote, invoice, payment, referral, and credit projections permitted by RLS. They cannot insert/update/delete settlement, events, awards, credits, or entitlements directly.
- Provider webhooks use a narrowly scoped trusted service endpoint, not browser/service-role exposure.
- Admin Support MVP remains read-only. It may later view allowlisted identifiers, states, timestamps, amounts/currencies, and sanitized reconciliation reasons only after separate projection/grant approval. It cannot renew, suspend, refund, award, reverse, impersonate, or bypass RLS.
- Every SECURITY DEFINER operation requires a non-login migration owner, fixed trusted `search_path`, schema-qualified objects, `PUBLIC`/`anon` revoke, least-privilege grants, tenant/role checks, idempotency reservation, and sanitized typed failures.
- Raw webhook bodies may contain sensitive data. Retention/encryption/redaction policy must be approved; evidence packages use hashes and sanitized projections only.

## Failure and idempotency matrix

| Failure | Required state/result | Forbidden outcome |
|---|---|---|
| Client retries checkout request | same attempt/reference or typed fingerprint conflict | second blind provider charge attempt |
| Provider timeout after initiation | `PROVIDER_CONFIRMATION_REQUIRED`, verify existing reference | assume failure and create another attempt |
| Duplicate webhook | exact replay, zero second effect | duplicate invoice/entitlement/reward |
| Same event ID, changed body digest | `EVIDENCE_CONFLICT`, quarantine | accept latest body |
| Webhook amount/currency/tenant mismatch | `RECONCILIATION_REQUIRED`, no entitlement | partial or cross-tenant activation |
| Browser reports success, webhook absent | remain pending and verify server-side | entitlement activation |
| Referral signup without settlement | attribution only | reward issuance |
| Self/duplicate referral | deny or manual fraud review, no award | transferable/cash reward |
| Settlement later refunded/charged back | append reversal/recovery evidence | delete payment or silently rewrite history |
| Entitlement write fails after settlement | transaction rollback or durable reconciliation queue | settled payment lost or untraceable partial state |

## Proposed verification package

### Synthetic/static before protected implementation

- Catalog effective-date/nonoverlap, ISO currency/minor-unit, monthly/annual selection, quote fingerprint, snapshot immutability, and legacy-unknown mapping.
- Adapter contract tests with synthetic Paystack-shaped fixtures: valid/invalid raw-body signature, duplicate/change-digest event, amount/currency/reference mismatch, timeout then fetch, out-of-order events, sanitized errors.
- Referral qualification, self/duplicate prevention, organization attribution, policy versioning, idempotent award, cap/no-negative-invoice, refund/chargeback reversal, and cross-tenant denial.
- Static checks that active Admin routes do not import fixture pricing/referral/mutation components and browser bundles do not contain provider secrets.
- Executable specification model: `scripts/specification/commercial-model.ts` with `commercial-model.test.ts`. It covers distinct delivery/poll paths converging on one settlement, aggregate credit reservations, timeout versus late settlement, immutable referral policy/first-settlement selection, partial reversal, and tenant/currency denial. Passing is design consistency only.

### Later protected acceptance

- PostgreSQL RLS/grants/SECURITY DEFINER ownership/search path; concurrent checkout/webhook/qualification replays; transaction rollback and exact effects; tenant/role denial; immutable audit/ledger checks.
- Paystack sandbox/webhook network checks only under an exact target, credential, endpoint, write, cleanup, and evidence authorization.
- Browser billing UI only after server contracts exist; verify callback ambiguity and server-authoritative refresh rather than local success.

## Approval gates and remaining owner decisions

1. Select the COM-02 “one month” valuation rule, qualification/holding period, cap, expiry, and annual/discount interaction.
2. Decide upgrade/downgrade timing/proration, annual discount policy, supported launch currencies, tax handling, failed-payment retries, and refund/chargeback entitlement effect.
3. Independently review an exact forward migration/RPC/Edge proposal. Sealed M-3 is not edited.
4. Separately authorize protected implementation.
5. Separately authorize disposable database/provider-sandbox/browser acceptance.
6. Separately authorize deployment, credentials/configuration, and financial activation.
