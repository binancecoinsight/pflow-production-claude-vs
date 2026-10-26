# BLK-002-I3 bounded correction report

Checkpoint referenced by owner: **PF-SUP-2026-10-26-03**  
Date: 2026-10-26  
Disposition: **CORRECTED LOCALLY — INACTIVE — UNEXECUTED — INDEPENDENT REVIEW REQUIRED**

## Authorization and provenance

The owner message `PHARMACYFLOW — BLK-002-I3 BOUNDED CORRECTION` explicitly authorizes this local correction, one new forward-only migration, focused local tests, evidence, hashes and review handoff. It prohibits StoreFlow, database/migration execution, Auth/provider/network/Docker/service/port/browser access, credentials, identity provisioning, installation, Git mutation, activation and deployment. That message is the authority for this batch.

The detailed PF-SUP-2026-10-26-03 review artifact is not present locally; only the findings quoted by the owner are available. The checkpoint's authorship and any broader approval are therefore **unverified** and are not inferred. Original I2/ADM-01/REV-01 provenance is the attached owner directive titled `PHARMACYFLOW — BLK-002-I2 GATEWAY/PROVIDER SECURITY DESIGN AND FEASIBILITY`, section 0 (I2 Option A, ADM-01 Option A and REV-01 Option A) and section 3. It authorizes design/contracts only and expressly withholds protected execution. No additional approval is invented.

## Corrections

- Issuance now validates the exact reservation and persists `PROVIDER_PENDING` atomically before provider inspection/create. Pending restart and uncertain outcomes perform exact recovery only; absent completion evidence cannot blind-create.
- Provider adoption requires the exact operation, normalized email and trusted owner marker. Staff identities remain protected; confirmed identities require the existing authenticated continuation contract.
- TypeScript and SQL use `PF-I3-COMMAND-V1` with ordered UTF-8 byte-length/null framing. The SQL v2 boundary recomputes complete command fingerprints and treats the supplied hash only as a comparison value.
- Applicant identity remains the normalized-email digest. Correlated Auth subject identity is stored separately in issuance, operation and revocation evidence.
- Current authority now requires trusted claims *and* an authoritative active row with exact credential version and action capability/permission. The registries are intentionally empty and have no provisioning path in this batch, so the proposed SQL contract fails closed.
- Unknown actions, malformed IDs/digests, missing fields, invalid predecessor/state transitions and cross-binding attempts fail before effects in the injected model. The default-to-revocation branch was removed.
- Migration `20261026000031_owner_gateway_operator_correction_v1.sql` withdraws executor access to the unsafe v1 RPCs and proposes corrected v2 RPCs. Migrations 000027–000030 remain byte-identical.

## Lock compatibility

Existing 000028/000029 behavior is unchanged: consumption/revocation serialize on the eligibility row, and reservation uses its established request/email/row sequence. Proposed 000031 paths add the operation advisory lock before the request/eligibility row. Issuance begin and completion serialize operation then request; revocation serializes operation then request. This is source reasoning only, **not PostgreSQL deadlock or concurrency proof**.

## Executed evidence

| Check | Exact result | Boundary |
|---|---:|---|
| Corrected gateway injected model | 18 passed | In-memory injected authority/repository/provider |
| Operator injected model | 25 passed | In-memory sequential transaction model |
| I3 static contract | 56 passed | Source and SQL text only |
| Corrected I2 model | 44 passed | In-memory specification |
| Existing issuer injected | 39 passed | Mock provider/repository |
| Existing issuer static/synchronous | 53 passed | No PostgreSQL concurrency |
| Existing onboarding static/synchronous | 28 passed | No SQL execution |
| Repository TypeScript `--noEmit` | PASS | Existing local compiler/dependencies |

No PostgreSQL parser/application, migration, RLS/effective-grant, Auth/JWT, provider, browser, network or real concurrency check ran. SQL claims are source reasoning and require independent review plus separately authorized disposable acceptance. Node emitted only its experimental-loader deprecation warning.

## Open blockers

1. **Authority provisioning choice:** no gateway/operator principal, credential, membership, JWT mapping or registry row exists. A future owner-approved design must choose who maintains the authoritative registries and how revocation/version rotation is administered. `service_role` is not a substitute.
2. Provider exact-operation lookup, verified absence semantics, trusted-marker behavior and authenticated confirmed-account continuation are not validated against a provider.
3. 000031 syntax, atomic rollback, uniqueness, effective privileges/RLS and overlapping PostgreSQL schedules are unexecuted.
4. AUTH-02 remains deferred. Signup, adapters and production integration remain disabled/absent.

## Precise proposed next scope

Stop for independent review of the correction manifest. A possible later scope—requiring new explicit owner authorization—is **BLK-002-I3A authority-provisioning and disposable acceptance design only**: choose the registry administrator and credential/JWT mapping; specify rotation/revocation ceremonies; review 000031 syntax and grants; and prepare (not execute) isolated PostgreSQL/Auth/provider concurrency cases. It excludes identity creation, grants/memberships, credentials, migration execution, provider calls, signup, production adapters, activation and deployment unless each is separately authorized.

## Safety attestation

No prohibited system was accessed and no protected operation ran. StoreFlow was not accessed. Migrations 000027–000030, all historical manifests, consumed history, sealed financial/Refund V2/onboarding contracts and unrelated dirty/untracked work were preserved.

The shared progress, decision and roadmap ledgers intentionally advanced for this correction and are hashed in the new scoped manifest. Their hashes in older manifests remain historical snapshot evidence and are not expected to match the advanced ledgers; the old manifest files themselves were not edited.
