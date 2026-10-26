# BLK-002 trusted OWNER eligibility issuer design

Checkpoint: **PF-SUP-2026-10-25-15**  
Status: **DESIGN ONLY — NOT IMPLEMENTED — NOT AUTHORIZED FOR AUTH, SQL OR ROLLOUT**

## 1. Authority boundary

The issuer is a trusted server boundary. A browser may submit an onboarding request, but submission proves neither identity nor OWNER eligibility. These inputs are descriptive only: request ID, normalized email, full name, intended pharmacy name, and currency. Password bytes are passed only to a future injected Auth provider and are never included in fingerprints, logs, database rows, responses or evidence.

An authoritative eligibility record is a private server row. Server-written Auth app metadata is a correlated classification/evidence copy, not the source of truth. Client metadata and deployment/readiness booleans never create, activate, replace or restore eligibility.

## 2. Who may request and why

### New prospective owner

An unauthenticated person may request creation of one new owner identity because email confirmation cannot occur before the Auth identity exists. The request remains `PENDING_EMAIL_CONFIRMATION`; it confers no OWNER capability. The issuer may proceed only when:

- the request is syntactically valid and carries a new UUID request ID;
- the normalized email is not already attached to an unrelated Auth identity;
- no active staff-bootstrap or conflicting owner operation exists for that email;
- server abuse/rate controls accept the request; and
- the exact contract version and intended-input fingerprint are reserved first.

Whether public self-service owner enrollment is commercially open is still an owner policy decision. Until explicitly selected, the implementation must default to a closed allowlist/administrative admission policy and return `ISSUANCE_DISABLED` before Auth work.

### Existing confirmed account

An unauthenticated request must never mutate or reclassify it. The person signs in normally. Existing memberships remain available. A future authenticated “open another pharmacy” policy would require a distinct authorization decision and a newly issued eligibility record; it is outside v1.

### Existing unconfirmed account

It is recoverable only when its trusted app metadata contains the exact issuer operation ID and request ID held by the private ledger. Email lookup may narrow a provider search but cannot establish correlation. Any unrelated or unmarked account is `EXISTING_IDENTITY_CONFLICT`.

### Staff-bootstrap identity

`STAFF_INVITATION_BOOTSTRAP_V1` and any identity carrying a staff-bootstrap marker are ineligible. They must confirm/sign in and use sealed M-16. Converting staff identity to owner eligibility is prohibited in v1; any later reclassification needs a separate owner policy, migration and independent review.

## 3. Server-controlled state

Proposed private ledger key: `(contract_version, request_id)`, with unique non-null `provider_operation_id`. After Auth subject correlation, `(contract_version, subject_id, request_id)` is also unique.

Required immutable fields:

- `contract_version = owner-eligibility-issuer-v1`;
- `owner_contract_version = owner-onboarding-v1`;
- `request_id`;
- server-generated `provider_operation_id`;
- normalized email digest plus separately protected normalized email only if the Auth adapter requires it;
- intended-input fingerprint covering owner contract version, request ID, normalized email, normalized pharmacy name and normalized currency;
- admission-policy version/evidence identifier;
- created timestamp from database UTC.

Mutable state is monotonic:

`RESERVED -> AUTH_CREATE_PENDING -> EMAIL_CONFIRMATION_PENDING -> ACTIVE -> CONSUMED`

Terminal alternatives are `REVOKED` and `CONFLICTED`. State may not move backward. `subject_id`, once set, is immutable. `ACTIVE` is necessary but not sufficient for OWNER creation: the OWNER RPC must match subject, request ID, contract version and intended-input fingerprint. `CONSUMED` retains the canonical completion evidence and cannot be reactivated.

Auth app metadata written by the trusted provider contains:

- `pharmacyflow_identity_class = OWNER_ONBOARDING_V1`;
- issuer and owner contract versions;
- request ID, subject ID and provider-operation ID;
- intended-input fingerprint;
- ledger evidence/version identifier.

The OWNER RPC must reject app metadata without a matching active private ledger row. App metadata alone is never authority.

## 4. Issuance, replay, conflict, revocation and replacement

- Exact replay means identical contract version, request ID, normalized email and intended-input fingerprint. It returns the stored canonical issuer response/state and performs no duplicate Auth creation.
- Same request ID with changed email or intended inputs is `REQUEST_CONFLICT` and has no new effects.
- Same email with a different in-flight request is `EMAIL_OPERATION_CONFLICT` unless the old operation is terminal and a reviewed replacement rule applies.
- Cross-subject replay is denied even if request ID and intended inputs match.
- Revocation is allowed only before `CONSUMED`. It marks the ledger `REVOKED`; the RPC denies it. If an unprivileged Auth identity already exists, it is retained disabled/unclassified or scheduled for separately authorized cleanup—never silently deleted.
- Replacement never edits the old fingerprint or operation. It creates a new request and provider-operation ID linked to the revoked predecessor. Replacement is unavailable for `CONSUMED` rows.

## 5. Email confirmation and continuation

1. Reserve the immutable ledger row before Auth work.
2. Call the injected Auth create operation with the server-generated provider-operation ID and initial trusted classification evidence.
3. Correlate the returned subject to that exact operation, persist `subject_id`, and enter `EMAIL_CONFIRMATION_PENDING`.
4. Send/allow the provider’s normal verification flow. The issuer does not forge confirmation.
5. After the provider reports confirmed email, an authenticated explicit recovery/continuation call verifies `auth.uid()`, confirmed status, app metadata and the active ledger row. It then transitions eligibility to `ACTIVE` or confirms an already active exact replay.
6. The user explicitly invokes owner onboarding. Normal session/member resolution never does so.
7. The OWNER RPC atomically creates tenant effects, stores its canonical response, and marks eligibility `CONSUMED` in the same database transaction. If those cannot share one transaction, rollout remains blocked until a reviewed claim/consume protocol exists.

## 6. Stable provider-operation correlation

`provider_operation_id` is generated and persisted before any provider call and is reused for every retry. The future Auth adapter must place it in non-client-writable provider/app metadata during creation. An ambiguous provider response is recoverable only by finding an identity whose trusted metadata contains that exact operation ID, request ID, contract version and email digest. Email-only recovery is forbidden.

Provider implementations must expose idempotent operations conceptually equivalent to:

- `createUnconfirmedOwnerIdentity(operation, identityInput)`;
- `recoverOwnerIdentityByOperation(operationId)`;
- `putExactTrustedOwnerMarker(subjectId, operationId, marker)`;
- `observeEmailConfirmation(subjectId)`.

No production provider is installed by this design.

## 7. Failure and recovery rules

| Failure point | Durable truth | Safe recovery |
|---|---|---|
| Before ledger reservation | No effects | Retry with the same client request ID. |
| After reservation, before Auth call | `RESERVED` | Reuse stored provider-operation ID. |
| Ambiguous Auth create | `AUTH_CREATE_PENDING` | Recover only by exact provider-operation marker; otherwise stop for support. |
| Auth created, ledger subject write fails | Auth identity is unconfirmed and non-OWNER | Reconcile exact operation marker to the reserved row; never create a second identity. |
| Ledger updated, trusted marker write ambiguous | Ledger binds subject/operation; authority still inactive | Read exact trusted marker, compare every field, then idempotently retry or conflict. |
| Email not confirmed | `EMAIL_CONFIRMATION_PENDING` | Permit normal confirmation resend/recovery only; OWNER RPC denied. |
| Confirmation observed, activation fails | Confirmed identity remains non-OWNER | Explicit recovery revalidates provider evidence and activates the same row. |
| OWNER RPC fails before commit | Active eligibility; zero tenant effects expected | Explicit exact retry; normal member access remains unaffected. |
| Response lost after OWNER commit | `CONSUMED` plus canonical response | Exact RPC replay returns stored response. |

Automatic deletion is excluded. Cleanup needs separate authorization because Auth creation and database continuation are not one transaction.

## 8. Unresolved owner/security policy

Before implementation is accepted, the owner must select who may pass admission: closed allowlist/manual approval (recommended for v1) or public self-service with specified abuse controls. Rate limits, verification resend limits, retention of abandoned identities/eligibility rows, support override roles, and post-consumption revocation consequences also require explicit policy. The safe default for every undecided field is deny/no issuance.
