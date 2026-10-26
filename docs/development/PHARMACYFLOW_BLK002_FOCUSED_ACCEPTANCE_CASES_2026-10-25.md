# BLK-002 focused acceptance cases

Checkpoint: **PF-SUP-2026-10-25-15**  
Status: **PREPARED ONLY — DO NOT EXECUTE**

## Evidence classes

- **S — static/source:** signatures, forbidden coupling, grants/policies represented in source. Never proves runtime behavior.
- **M — injected/synchronous model:** deterministic state/replay/failure model. Never proves PostgreSQL locks, Auth or browser behavior.
- **Q — future real SQL:** disposable PostgreSQL/PostgREST sessions with inspected locks/effects.
- **A — future real Auth/provider:** isolated trusted provider and confirmation behavior.
- **B — future real browser:** isolated browser/session/restart behavior.

Only S/M work may be included in the proposed local-authoring batch. Q/A/B remain separately authorized and AUTH-02 remains owner-deferred.

## Prepared cases

| ID | Scenario | S/M assertion now or in proposed authoring | Future acceptance evidence |
|---|---|---|---|
| OI-01 | Authorized new-owner creation | Model requires active issuer ledger, exact app marker, confirmed identity and matching intent fingerprint; canonical result is exact-replay stable | A+Q: one Auth subject, one eligibility operation, one pharmacy/branch/subscription/OWNER set. |
| OI-02 | Anonymous OWNER RPC | Static typed denial and zero-effect model | Q through anon PostgREST: typed denial, zero rows/locks retained. |
| OI-03 | Unconfirmed identity | State remains `EMAIL_CONFIRMATION_PENDING`; OWNER continuation denied | A+Q: provider unconfirmed evidence and database denial with no tenant effects. |
| OI-04 | Staff-bootstrap identity | Identity class/marker yields `STAFF_IDENTITY_PROHIBITED`; sealed M-16 path remains available | A+Q: exact staff account denied OWNER but accepts authorized invitation through unchanged M-16. |
| OI-05 | Missing issuer record | App metadata or client intent alone is insufficient | Q: confirmed identity with forged client metadata/app-marker mismatch denied. |
| OI-06 | Cross-subject replay | Same request ID and inputs under another subject cannot read/replay/consume the first subject’s eligibility or onboarding response | Two Q sessions/JWTs prove row-policy isolation and zero cross-effects. |
| OI-07 | Changed fingerprint | Same scoped request with changed email/name/currency/version returns typed conflict | Q proves original reservation/response unchanged. |
| OI-08 | Concurrent exact retry | Synchronous model labels one logical winner and exact replay; no concurrency claim | Two Q sessions must be observed concurrently, including relevant lock wait, then prove one effect set and identical responses. |
| OI-09a | Failure after request reservation | Model rolls back all database effects | Q test-only fault injection proves zero reservation and tenant rows after transaction abort. |
| OI-09b | Failure after pharmacy insert | Same | Q proves cascade/transaction rollback leaves zero orphan rows. |
| OI-09c | Failure after branch insert | Same | Q proves zero pharmacy/branch/request effects. |
| OI-09d | Failure after subscription insert | Same | Q proves zero pharmacy/branch/subscription/request effects. |
| OI-09e | Failure after OWNER membership insert/before completion update | Same | Q proves zero tenant/membership/request effects. |
| OI-10 | Ambiguous Auth create | Recovery requires exact provider-operation metadata; email-only and wrong-operation results fail | A: injected provider ambiguity followed by real provider lookup proves exact correlation/no duplicate. |
| OI-11 | Auth created, ledger continuation failure | Model retains non-OWNER unconfirmed identity and same reserved operation | A+Q: retry correlates same subject; no second Auth identity and no premature ACTIVE eligibility. |
| OI-12 | Trusted-marker write/completion partial failure | Exact marker/operation is idempotent; conflicting marker fails | A+Q: retry completes same row/subject or stops conflicted. |
| OI-13 | Existing-member access during issuer/RPC outage | Session resolver contains no issuer/OWNER RPC dependency; membership model remains ready | B with RPC unavailable: existing member signs in, selects among memberships and refreshes normally. |
| OI-14 | Explicit recovery after restart | Client request description preserves request ID; no automatic refresh attempt | B+A+Q: close/reopen, sign in, normal membership resolution first, explicit recovery uses original request/operation and exact replay. |
| OI-15 | Existing confirmed account | Issuer returns sign-in-required/conflict without metadata mutation | A+B: existing credentials/memberships/app metadata remain byte-equivalent. |
| OI-16 | Revoked/replaced eligibility | Revoked record cannot activate/consume; replacement uses new immutable request/operation and links predecessor | Q+A: old operation denied, new exact operation succeeds only after confirmation. |
| OI-17 | Lost OWNER RPC response | Model stores canonical response and consumes eligibility atomically | Q: disconnect after commit, exact retry returns identical JSON and no duplicate effects. |

## Future execution preconditions

Q/A/B cases require a newly approved isolated PharmacyFlow-only target, exact source/hash manifest, scoped nonproduction identities, test-only fault-injection design, credential handling outside evidence, target identity guard, cleanup plan and separate execution commands. No case is authorized by this document. StoreFlow is prohibited.
