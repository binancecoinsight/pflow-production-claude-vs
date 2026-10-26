# BLK-002-I3 local authoring completion report

Review baseline referenced by owner: **PF-SUP-2026-10-26-02**  
Date: 2026-10-26  
Branch / HEAD: `main` / `d145324be6d5f1c787bceab6baf27ca0ce375eeb`  
Status: **LOCAL AUTHORING COMPLETE — INACTIVE — UNEXECUTED — INDEPENDENT REVIEW REQUIRED**

## 1. Authorization provenance and limit

The owner message titled `OWNER AUTHORIZATION — PHARMACYFLOW BLK-002-I3`, received in the current work session, explicitly authorizes inactive injected gateway/operator façades, focused local tests, forward-only unexecuted migration `20261026000030_owner_gateway_operator_contract_v1.sql`, least-privilege contracts, local recovery/idempotency, documentation, hashes and review packaging. It expressly withholds database/migration execution, real Auth/provider/network/Docker/browser access, credentials, installation, service/port operations, Git mutations, activation and deployment.

The owner references independent checkpoint `PF-SUP-2026-10-26-02`; no corresponding review artifact is present in the repository. Its detailed findings are therefore **not locally verified** and are not invented here. The present owner authorization is the primary authority for I3; repository ledgers are secondary records.

## 2. Implemented local artifacts

### Inactive injected façades

- `_shared/owner-security-i3.ts`: canonical SHA-256 command identity, deep immutable copies, credential/principal types and injected authority contracts.
- `owner-eligibility-gateway/index.ts`: injected reservation, explicit reservation recovery, exact provider-operation issuance recovery, atomic repository correlation and explicit issued-result recovery.
- `platform-admission-operator/index.ts`: injected admission approval/replacement/revocation, eligibility revocation and current-authority recovery.

There is no HTTP/server entrypoint, environment lookup, backend client, provider adapter, token, credential or runtime route. The façades cannot activate signup or invoke a database.

### Forward-only migration artifact

`20261026000030_owner_gateway_operator_contract_v1.sql` is marked **UNEXECUTED** and:

1. aborts if either executor role already exists;
2. creates `pharmacyflow_owner_gateway_executor` and `pharmacyflow_platform_admission_operator` as `NOLOGIN NOINHERIT NOBYPASSRLS` roles;
3. creates no login, credential, JWT, membership grant or service-role substitution;
4. aborts if pre-I3 admission/eligibility rows exist, because pharmacy context/operator decision cannot be guessed safely;
5. adds append-only security-operation, admission-decision and eligibility-revocation evidence;
6. adds mandatory prospective pharmacy context and admission-decision bindings to future admission/eligibility rows;
7. extends the eligibility immutability trigger to the I3 bindings;
8. derives current principal, audience, credential version and per-action capability/permission from trusted JWT claims;
9. gives executor roles no direct table privileges;
10. grants only three gateway RPCs to the gateway executor and two operator RPCs to the operator executor;
11. explicitly revokes those functions from public, `anon`, `authenticated`, `service_role` and the opposite executor;
12. commits operation result, audit/decision and state effect in the same SQL function transaction.

No claim is made that the proposed JWT role mapping is supported by a live provider. No role membership exists, so the contracts remain inactive.

## 3. Least-privilege matrix

| Principal | Granted façade operations in 000030 | Explicitly unavailable |
|---|---|---|
| Gateway executor | reserve eligibility; correlate exact provider identity; recover exact gateway operation | admission decisions, eligibility revocation, direct tables, consumption, membership/role creation |
| Platform admission operator | approve/replace/revoke admission; revoke eligibility | gateway reservation/identity/recovery, direct tables, consumption, tenant creation |
| Applicant (`authenticated`) | no I3 function grant | every gateway/operator operation; existing authenticated OWNER consumption remains governed by prior contract |
| `service_role` | no I3 function or table grant | all I3 façades and evidence tables |
| Issuer owner role | owns protected tables/functions under forced-RLS owner policies | no login or external identity mapping is added |

An executor role by itself is insufficient: each façade first validates the expected role claim, `pharmacyflow-owner-i3` audience, principal class, stable subject, positive credential version and exact capability/permission. Replay lookup occurs only afterward.

## 4. Idempotency and recovery

- Operation identity binds action, stable principal, applicant key, pharmacy context and computed typed-command fingerprint. Credential version is audit evidence, not stable operation identity.
- Reservation/identity/admission façades recompute the normalized-email SHA-256 applicant key and reject caller-selected mismatches before authority/effect work.
- Exact operation replay returns the stored canonical result only after current authority checks.
- Same operation ID with a changed action, principal, applicant/context or fingerprint is `OPERATION_CONFLICT`.
- Provider creation ambiguity is recoverable only by exact provider-operation ID. Missing/wrong recovery fails closed.
- Database response ambiguity after correlation is recoverable only from the exact authoritative operation result.
- Explicit identity recovery requires `IDENTITY_RECOVER`, distinct from `IDENTITY_ISSUE`.
- Results returned by TypeScript façades are deep immutable copies.
- A new operation cannot overwrite admission, eligibility or provider-operation identity; database uniqueness/terminal checks remain authoritative.

The migration takes a conservative compatibility position: it refuses to assign context or operator provenance to rows created before I3. A later execution proposal must either prove these tables empty or separately authorize a reviewed reconciliation.

## 5. Lock compatibility

| Path | Existing/proposed lock order | Disposition |
|---|---|---|
| Existing `000029` reservation | request advisory → email advisory → exact request → admission share → open/predecessor eligibility | Preserved unchanged. |
| I3 reservation | operation advisory → request advisory → email advisory → admission share → open/predecessor eligibility | Adds operation serialization before the existing order. |
| I3 admission decision | operation advisory → email advisory → admission update | Shares the email key with reservation, so revocation-first blocks a new reservation and reservation-first retains independent eligibility. |
| Existing OWNER consumption | eligibility row → onboarding request → tenant effects/consumed update | Preserved unchanged. |
| I3 eligibility revocation | operation advisory → same eligibility row | The target eligibility row serializes against consumption; commit order determines the winner. |
| I3 identity correlation | operation advisory → eligibility row → existing private pending/correlation logic | Never acquires an earlier email/admission lock after eligibility. |

This is static/source reasoning plus sequential mocks. PostgreSQL overlap, deadlock freedom, effective locks, RLS and grants remain **NOT VERIFIED** under deferred AUTH-02.

## 6. Fresh local evidence

| Suite | Result | Boundary |
|---|---:|---|
| Inactive gateway injected test | **16 passed** | Mock authority/repository/provider; no network or database |
| Inactive operator injected test | **17 passed** | Mock authority/repository; sequential state only |
| I3 static gateway/operator contract | **42 passed** | Source/SQL text and sealed migration hashes; no SQL execution |
| Corrected I2 model | **44 passed** | In-memory specification only |
| Existing issuer injected | **39 passed** | Mock provider/repository |
| Existing issuer static/synchronous | **53 passed** | Not PostgreSQL concurrency |
| Existing onboarding static/synchronous | **28 passed** | Not SQL concurrency |
| Focused strict TypeScript | **PASS** | New I3 source/tests/contracts only |

One initial static I3 run failed because an explanatory source comment contained a token used by the inactive-entrypoint guard. The comment was reworded; no runtime behavior changed, and the corrected static suite passed 42/42.

## 7. Findings and unresolved evidence

No new P0 source defect was demonstrated in the local I3 artifacts.

Release-blocking P1 evidence remains:

- provider exact-operation creation/recovery and trusted metadata behavior;
- workload/operator JWT issuance, audience/role mapping, rotation and revocation;
- real PostgreSQL syntax/application, effective privileges, RLS and forced-RLS ownership;
- real admission/reservation and eligibility-revocation/consumption concurrency;
- compatibility decision for any nonempty pre-I3 ledger;
- Authenticated applicant confirmation/recovery and browser flows.

P2 items remain operator access operations, dual-control thresholds, audit retention/export, anomaly limits and provider outage runbooks.

## 8. Exact next authorization boundary

This milestone stops at independent review. A later owner decision may authorize a narrowly defined verification or correction batch. It must separately specify the exact snapshot, target, identity/access method and commands. This report does **not** request or authorize migration execution, role creation, JWT/credential issuance, provider calls, gateway deployment, signup/admission activation or production integration.

AUTH-02 remains **DEFERRED**. PharmacyFlow M4/MVP and deployment readiness remain blocked.

## 9. Review request

Request GPT-6 Work review only the I3 manifest and direct dependencies. Verify façade inactivity, authority-before-replay behavior, typed fingerprints, exact ambiguity recovery, SQL role/grant separation, forced RLS, compatibility abort, atomic audit/effect functions, lock order, sealed migration hashes, tests and documentation. Do not broaden into a full repository audit or infer execution/activation authority.

## 10. Safety attestation

No database or migration was executed. No Auth/provider/network/Docker/browser-storage, credential, installation, service/port, Git staging/commit/push/tag, privileged activation, cleanup or deployment operation occurred. No StoreFlow resource was accessed or inspected. Migrations `000027`–`000029`, financial/Refund V2/onboarding contracts, historical manifests and unrelated dirty/untracked work were preserved.
