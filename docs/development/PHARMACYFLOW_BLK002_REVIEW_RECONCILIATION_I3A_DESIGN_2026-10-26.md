# PharmacyFlow BLK-002 review-evidence reconciliation and I3A design

Date: 2026-10-26  
Branch / HEAD: `main` / `d145324be6d5f1c787bceab6baf27ca0ce375eeb`  
Authority: owner message `PHARMACYFLOW — REVIEW-EVIDENCE RECONCILIATION AND I3A`  
Disposition: **REVIEW EVIDENCE RECONCILED — I3A DESIGN COMPLETE — RUNTIME/ACCEPTANCE UNEXECUTED — STOP FOR REVIEW**

## 1. Evidence reconciliation

### 1.1 Transcript-attributed independent review evidence

The owner supplied the following review dispositions in the current transcript. They are recorded exactly at the level supplied—without invented reviewer reasoning, test transcripts, signatures or broader authority:

- `PF-SUP-2026-10-26-02 accepted corrected I2 source/synthetic suitability for bounded I3 local authoring, subject to separate owner approval.`
- `PF-SUP-2026-10-26-05 passed I3 boundary/parity corrections locally.`
- `PF-SUP-2026-10-26-06 confirmed unchanged implementation hashes and identified the missing repository review export.`

Attribution: **owner-supplied transcript evidence**, not a repository-native GPT-6 export. The missing repository review export remains missing. These statements establish the supplied technical dispositions only. They do not supply omitted findings, authorize protected execution, accept provider feasibility, or grant database/Auth/browser/deployment authority.

### 1.2 Superseding clarification

The preserved conditional-gate assessment at `PHARMACYFLOW_BLK002_I3_CONDITIONAL_GATE_REVIEW_REQUEST_2026-10-26.md` correctly reported that independent I2 acceptance was not then locally verifiable. It and its SHA-256 manifest remain byte-identical historical evidence. The current owner-supplied PF-SUP-02 transcript disposition resolves the evidence gap **prospectively for the bounded I3 local-authoring gate**, while PF-SUP-05/06 record later local technical review/hash continuity. The earlier report is not erased or called corrupt; it describes the evidence available at that time.

### 1.3 Three distinct gates

| Gate | Current disposition | What it does not mean |
|---|---|---|
| Technical review | PF-SUP-02 accepted corrected I2 suitability; PF-SUP-05 passed I3 boundary/parity locally; PF-SUP-06 confirmed unchanged implementation hashes, all by owner-supplied transcript attribution | No provider, PostgreSQL, Auth, browser or concurrency acceptance |
| Owner permission | Prior owner messages authorized bounded I3 local authoring/corrections; the current owner message authorizes reconciliation and I3A **design only** | No identity, credential, grant, migration, fixture, service or runtime activation authority |
| Protected execution | **NOT AUTHORIZED; AUTH-02 remains deferred** | No database/Auth/provider/network/browser/Docker execution, provisioning, deployment or signup enablement |

### 1.4 Hash continuity and historical ledger advancement

Pre-edit read-only verification in this batch found the PF-SUP-04 manifest at SHA-256 `42d02485bfea66b2e868665859b5e9f09a0db2381b37813670c0866fc3557442` matching **12/12** entries. After this authorized reconciliation, its eight implementation/configuration entries and report remain unchanged while its three shared development ledgers have advanced and are captured by the new manifest. This supports the owner-supplied PF-SUP-06 statement about implementation hashes without pretending the append-only ledgers retain old hashes. No unchanged tests were rerun.

Historical manifests are immutable snapshot indexes. Shared progress, decision, approval, blocker and evidence ledgers append later milestones, so their current hashes can differ from hashes embedded in earlier manifests. That is expected append-only advancement, not corruption. Each old manifest remains evidence for its own snapshot; a new manifest covers this package.

## 2. I3A authority-registry administration design

This section is design only. It does not create roles, rows, identities, credentials, grants or runtime mappings.

### 2.1 Administrative roles and separation of duties

| Function | Proposed human/system role | Allowed responsibility | Explicit prohibition |
|---|---|---|---|
| Policy owner | Product owner | Approves capability/permission policy, bootstrap and emergency actions | Cannot issue credentials or edit registries directly |
| Security approver | Designated security reviewer | Reviews principal purpose, audience, scopes and evidence; second approval for bootstrap/rotation/reactivation | Cannot operate workload or approve own request |
| Registry custodian | Restricted security operations identity | Executes an approved registry change through a future narrow admin boundary | Cannot mint JWTs, invoke gateway/operator business RPCs or bypass audit |
| Credential issuer | Independently controlled workload IdP/signing service | Issues short-lived assertions for an already-approved active principal/version | Cannot add capabilities, activate registry rows or change applicant/context |
| Gateway workload | Dedicated non-human principal | Uses only gateway capabilities in its active registry row | Cannot manage authority, operator decisions, consumption or arbitrary tables |
| Platform operator | Named human principal with MFA | Uses only individually approved admission/revocation permissions | Cannot use gateway issuance/recovery or administer own authority |
| Independent reviewer | GPT-6/security reviewer | Reviews hashes, change request, evidence and exceptions | Cannot authorize owner decisions or execute changes |
| Applicant | Authenticated PharmacyFlow user | Authenticated continuation, eligibility consumption and applicant-only recovery under existing contracts | Cannot act as gateway/operator or select another subject |

Recommended minimum: two distinct humans for bootstrap, permission expansion, reactivation and emergency-revocation reversal. Suspension and emergency revocation may be initiated by one authorized security operator but require after-the-fact second-party review within a recorded SLA. No actor may request, approve and execute the same privilege increase.

### 2.2 Registry records

The proposed authoritative record remains keyed by stable `principal_id`, with:

- principal class (`GATEWAY` or `PLATFORM_OPERATOR`);
- active/suspended/revoked disposition;
- one current positive credential version;
- exact capability or permission set;
- approved audience and issuer identifiers;
- optional credential key/thumbprint identifiers (never secret material);
- request/approval/execution actor IDs and timestamps;
- reason/evidence reference;
- prior-version reference and expiry;
- emergency flag and review due time.

Runtime business functions must only read the authoritative active/version/action decision. They cannot create or repair authority records. JWT claims are assertions to compare, never the authority source.

### 2.3 Bootstrap ceremony

1. Owner approves a principal purpose, class, audience and minimal actions.
2. Security approver verifies the workload/operator is distinct from applicant, service-role and issuer-owner identities.
3. Registry custodian creates the principal **inactive**, version 1, with no capabilities by default.
4. Credential issuer prepares a short-lived identity mapping and supplies only public issuer/key metadata for review; no secret enters the registry.
5. Disposable acceptance proves exact subject/issuer/audience/class/version mapping and denial of generic admin, pharmacy-user, service-role and issuer-owner identities.
6. Second approver authorizes the exact capability set and activation.
7. Registry custodian activates through a future audited admin boundary.
8. Independent evidence review precedes any non-disposable runtime mapping.

Bootstrap must abort if stable subject ownership, issuer key custody, audience enforcement, revocation latency or database-role mapping cannot be demonstrated.

### 2.4 Rotation

Recommended smallest contract: **single active credential version per stable principal**, matching the current exact-version checks. Prepare version `n+1` inactive; validate it in a disposable target; atomically change the registry current version; immediately reject version `n`; retain immutable rotation evidence. Operation identity continues to bind stable principal, not credential version, so authorized exact recovery survives rotation while stale credentials fail.

Overlapping active versions are not supported by the current proposed registry and require a separate schema/security review. Key material must never be copied into PharmacyFlow tables or evidence.

### 2.5 Suspension, revocation and recovery

- **Suspension:** set `active=false`; all new calls and recovery fail closed. Preserve version and reason for investigation. Reactivation requires two-party approval and evidence that credential custody remains sound.
- **Emergency revocation:** one authorized security operator may deactivate immediately, increment/invalidate credential version and record an emergency audit event. No business RPC or `service_role` shortcut may substitute.
- **Permanent retirement:** inactive terminal record, credential revoked at issuer, no principal-ID reuse, no capability resurrection.
- **Compromise recovery:** create a new version only after incident containment and second approval. Exact historical results remain immutable but undisclosable until current recovery authority is restored by an approved action.

### 2.6 Audit requirements

Every authority change requires append-only evidence containing request ID, stable principal, class, before/after active state, before/after version, before/after actions, requester, approver, executor, reason, evidence hash, emergency flag and UTC timestamps. Audit append and registry mutation must be one transaction. Audit failure must roll back the authority change. No update/delete access is granted to gateway/operator principals.

Retention/export period, alert thresholds and dual-control SLA remain owner/security policy decisions.

## 3. Proposed identity mapping

### 3.1 Gateway workload

Proposed assertion fields: immutable workload subject, issuer, `pharmacyflow-owner-i3` audience, gateway principal class, positive credential version, short expiry, unique token ID and narrowly requested capabilities. The database boundary compares subject/version/action with the authoritative registry. Token possession alone is insufficient.

Unverified platform capabilities:

- whether the selected issuer can mint short-lived workload JWTs with the exact audience/custom claims;
- whether Supabase/PostgREST can map them to the proposed `NOLOGIN` executor role without granting a generic service role;
- issuer key rotation/JWKS caching and maximum revocation latency;
- token replay/JTI enforcement and clock-skew bounds;
- reliable separation between external role mapping and application claims.

Until demonstrated, no runtime gateway identity may be provisioned.

### 3.2 Platform operator

Proposed mapping: named human identity, phishing-resistant MFA, platform-scoped operator subject, short session, reviewed permission registry and step-up authentication for permission expansion/emergency reversal. Existing `platform-admin` labels do not confer authority. Operator principal IDs cannot equal gateway or applicant subjects, and operator recovery checks the current exact action permission.

Unverified: supported MFA/step-up hooks, session revocation latency, custom claim freshness, role mapping and auditable admin lifecycle.

### 3.3 Applicant

Applicant authentication remains the existing authenticated-user boundary. Email digest is stable applicant identity before/after Auth correlation; immutable Auth subject is stored separately. Applicant continuation/consumption requires `auth.uid()` subject equality and existing trusted marker/context bindings. Gateway/operator claims cannot impersonate an applicant or consume eligibility.

## 4. Proposed disposable target (not created or probed)

| Resource | Exact proposed identity |
|---|---|
| Project label | `pharmacyflow-i3a-acceptance-20261026` |
| Database | `postgres` in a newly disposable PharmacyFlow-only target |
| Database service alias | `pharmacyflow_i3a_acceptance_20261026` |
| API | `127.0.0.1:57321` |
| PostgreSQL | `127.0.0.1:57322` |
| Studio | `127.0.0.1:57323` |
| Mail capture | `127.0.0.1:57324` |
| Analytics/inspector/pooler | `127.0.0.1:57327`, `57328`, `57329` |
| Application | `127.0.0.1:57300` |
| Browser profile | `C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-i3a-acceptance-20261026-browser` |
| Evidence directory | `C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-i3a-acceptance-20261026-evidence` |

These are proposals, not claims that resources exist. Future authorization must name every service/port, credential delivery method, fixture write, cleanup action and destruction decision. Abort on any mismatch, existing unknown data, non-loopback binding, port collision, source drift, unexpected service, or any StoreFlow/original-environment identity. Never inspect StoreFlow to establish isolation.

## 5. Fixed fixtures

| Fixture | Value |
|---|---|
| Gateway principal | `i3a-gateway-0001`, versions 1/2 |
| Second gateway | `i3a-gateway-0002` |
| Operator | `i3a-operator-0001`, versions 1/2 |
| Underprivileged operator | `i3a-operator-none-0001` |
| Applicant A | `owner.i3a.001@example.invalid`; digest `c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf` |
| Applicant B | `owner.i3a.002@example.invalid`; digest `0f46f0ba6b7213ccafdfd4a8245a5b323735e7970e69f67cdbf0a3ab00633d29` |
| Context A/B | `10000000-0000-4000-8000-000000000001` / `10000000-0000-4000-8000-000000000002` |
| Operations | UUIDs under `20000000-0000-4000-8000-*`; final 12 digits equal the matrix-case sequence |
| Requests | UUIDs under `30000000-0000-4000-8000-*` |
| Decisions/revocations | UUIDs under `40000000-0000-4000-8000-*` |
| Provider operations/subjects | UUIDs under `50000000-*` / `60000000-*` |

Fixtures must be guarded by exact project label, email suffix, UUID prefixes and a run ID. No production-like email or existing subject is permitted.

## 6. Acceptance matrices — prepared, not executed

### 6.1 PostgreSQL, ACL and RLS

| ID | Case | Required evidence | Pass condition |
|---|---|---|---|
| DB-01 | Clean ordered migration replay through 000032 | migration hashes, raw stdout/stderr, ledger | Exact ordered success; no drift/skips |
| ACL-01 | Function ACL inventory by exact signature | `aclexplode`/`has_function_privilege` rows | Active RPC only intended executor; PUBLIC/anon/authenticated/service_role/opposite denied |
| ACL-02 | Superseded v1/v2 identity RPCs | role-specific invoke attempts | All external executors denied |
| RLS-01 | Direct table access | SELECT/INSERT/UPDATE/DELETE attempts for both executors and ordinary identities | Denied; no rows/effects |
| AUTHZ-01 | Active/version/action registry checks | active, stale, revoked, wrong-action identities | Only exact current action allowed, including recovery |
| OP-01 | Global operation collision | both insertion orderings; cross-action/principal/context/command | Collision before provider marker; no effect/result/audit |
| ATOM-01 | Forced audit failure | before/after snapshots | Registry/business effect and result all roll back |
| REPLAY-01 | Completed exact replay | row/effect counts and canonical JSON | Original immutable result; zero new effects |

### 6.2 Rollback and concurrency

| ID | Overlap | Required ordering/evidence | Pass condition |
|---|---|---|---|
| CON-01 | Same issuance operation twice | two backend PIDs, committed fixture, barrier, lock waits | One durable attempt/create authorization; other exact replay/pending recovery |
| CON-02 | Pending issuance vs another action using same operation ID | both orderings | One namespace winner; loser conflict; no partial effects |
| CON-03 | Admission revoke vs reservation | shared applicant serialization | Commit order deterministically controls new reservation |
| CON-04 | Eligibility revoke vs consumption | same eligibility row lock | One terminal winner; consumed evidence immutable |
| CON-05 | Completion vs emergency authority revoke | recorded lock/commit timestamps | Each call uses current authority at transaction entry; no fabricated success |
| RB-01 | Failure after provider create/before correlation | exact provider status plus DB snapshots | Restart resolves original provider operation; no blind create |
| RB-02 | Failure during correlation/audit | transaction logs and counts | Full rollback or exact completed result; never partial success |

Delayed/non-overlapping sessions fail concurrency acceptance. Sequential tests are not substitutes.

### 6.3 Auth and provider

| ID | Case | Pass condition |
|---|---|---|
| ID-01 | Gateway issuer/audience/class/version mapping | Exact active registry match only |
| ID-02 | service_role, pharmacy user, issuer-owner and generic admin tokens | All rejected as gateway/operator authority |
| ID-03 | Expired, stale, suspended, revoked and rotated tokens | Stale/revoked denied; current stable principal may exactly recover |
| ID-04 | Operator MFA/session/permission changes | Exact action permission and revocation freshness demonstrated |
| PRV-01 | Provider create with operation ID | One creation under duplicate/lost-response retries |
| PRV-02 | Exact status `FOUND` | Returns immutable subject/marker binding |
| PRV-03 | Exact status `PROVEN_ABSENT` | Evidence semantics independently demonstrated; no assumption from 404/timeout |
| PRV-04 | `UNKNOWN`/timeout/outage | Remains recovery pending; no blind create |
| PRV-05 | Existing staff/confirmed/unrelated identity | Staff protected; confirmed requires authenticated continuation; unrelated marker conflicts |

If the provider cannot demonstrate exact operation lookup and trustworthy proven-absence semantics, provider integration remains blocked.

### 6.4 Browser/application

| ID | Case | Pass condition |
|---|---|---|
| UI-01 | Signup/manual-admission routes | Remain disabled/unavailable before activation approval |
| UI-02 | Applicant confirmed continuation | Authenticated matching subject/context only |
| UI-03 | Cross-subject/context recovery | Denied without evidence disclosure |
| UI-04 | Session revocation/rotation | Stale session cannot recover or mutate |
| UI-05 | Browser storage | No privileged workload/operator credential or authority evidence persisted client-side |
| UI-06 | Restart/reload | Authoritative server recovery; no client-fabricated success |

Browser tooling and the named isolated profile require separate approval. No browser-storage operation is authorized by this design.

## 7. Proposed future commands — do not run

The following command set is a proposal contingent on separate authorization, creation and independent hashing of `scripts/acceptance/i3a/*`. Those files do not exist in this design batch.

```powershell
pwsh -NoProfile -File .\scripts\acceptance\i3a\target-guard.ps1 -ExpectedProject pharmacyflow-i3a-acceptance-20261026 -ExpectedDbPort 57322 -ExpectedApiPort 57321
pwsh -NoProfile -File .\scripts\acceptance\i3a\apply-migrations.ps1 -PgService pharmacyflow_i3a_acceptance_20261026 -Through 20261026000032
psql -X "service=pharmacyflow_i3a_acceptance_20261026" -v ON_ERROR_STOP=1 -f .\scripts\acceptance\i3a\acl-rls-fixture.sql
psql -X "service=pharmacyflow_i3a_acceptance_20261026" -v ON_ERROR_STOP=1 -f .\scripts\acceptance\i3a\acl-rls-assertions.sql
pwsh -NoProfile -File .\scripts\acceptance\i3a\concurrency.ps1 -PgService pharmacyflow_i3a_acceptance_20261026 -EvidenceRoot "C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-i3a-acceptance-20261026-evidence"
node --loader .\scripts\typescript-loader.mjs .\scripts\acceptance\i3a\auth-provider.acceptance.ts
node --loader .\scripts\typescript-loader.mjs .\scripts\acceptance\i3a\browser.acceptance.ts --profile "C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-i3a-acceptance-20261026-browser"
pwsh -NoProfile -File .\scripts\acceptance\i3a\fixture-cleanup.ps1 -PgService pharmacyflow_i3a_acceptance_20261026 -RunId I3A-20261026-001
```

Before authorization, a reviewer must inspect each future runner, record its SHA-256, dependency graph, exact writes, credential source, services/ports and cleanup scope. Credentials must be ephemeral process inputs, never command-line literals or evidence output.

## 8. Evidence handling, abort and cleanup

Evidence must record source/runner/migration hashes, target guard output, UTC times, backend PIDs, identities by non-secret fixture ID, claims minus tokens, raw SQL results, effect counts, lock waits, provider status classification, browser case result and cleanup result. Redact JWTs, secrets, cookies and connection strings. Evidence is written only to the approved directory and hashed before review.

Abort before writes on target/hash/port/service/credential mismatch, nonempty unknown data, StoreFlow/original environment identity, missing runner review, provider capability ambiguity, unexpected role membership, non-loopback binding or inability to guarantee cleanup scope. During execution, abort on unexpected migration, ACL, RLS, effect count, lock ordering, timeout classification or identity mapping.

Fixture cleanup may be authorized separately for exact UUID/email/run-ID guards and only after evidence capture. Environment/container/volume/profile/evidence deletion is destructive and needs a distinct owner authorization. On cleanup failure, preserve the disposable target and request direction.

## 9. Source hashes for this design baseline

| Source | SHA-256 |
|---|---|
| `tsconfig.i3.json` | `c9476c509ef68366fa1054e201ad8294c64b1f4612378944d398887a962505e9` |
| `_shared/owner-security-i3.ts` | `4834d941fd92bf161756f9294de55cab36a1ed3675c035da6d6da6d8e63f3a3b` |
| gateway façade | `bba440f90f4d4059eac1dabc5238ebcaaff8a1e99918de883105f134004c86a8` |
| gateway injected test | `6119a39ac230348de49dd29b16a1c2fe18070af49a003f01133b5a136129c050` |
| operator façade | `b5f48e0de906b531ef5f54877fd5ff4f67c7bf6d9524e343a5a95f854ff926bc` |
| operator injected test | `3ea8bb25b428c4796e496c73291977d328cf07cc76322a7c787b7327ebc2de74` |
| static I3 contract test | `207b00340f561c057c6ed1dd96fdcf0ebd223009fb74bc1912008bb3ebe47d79` |
| migration 000030 | `e6b5ee258573eab85e8913601fd64eeff97c3a1f59d497369cdc847cab8cae54` |
| migration 000031 | `9e2a85990b85ec73746f3114d3b798a61135b42072c22558a4fa51c9ce4cba6e` |
| migration 000032 | `448384e6981c66ac0090716eb1322e45f90a2464440cbe7170380c91cdbb66da` |

The PF-SUP-04 implementation/configuration entries above remain unchanged locally. The package manifest adds current reconciliation/design ledgers without modifying implementation.

## 10. Smallest remaining owner decisions and scopes

1. **REG-01 — Registry governance:** approve named requester/approver/custodian roles, two-person events, emergency SLA and audit retention.
2. **IDP-01 — Identity mechanism:** select and document a provider capable of exact issuer/audience/custom-claim, short TTL, rotation/revocation and non-service-role database mapping. Design/feasibility first; no credential issuance.
3. **ROT-01 — Rotation:** approve recommended single-active-version semantics or authorize a separate overlap design.
4. **PRV-01 — Provider feasibility:** authorize documentation/read-only sandbox validation of exact operation status and proven-absence semantics; no production adapter.
5. **ACC-01 — Harness authoring:** authorize local creation/review of the proposed `scripts/acceptance/i3a/*` runners only, without execution.
6. **AUTH-02/I3A-EXEC — Disposable acceptance:** later name the exact target, services/ports, credential delivery, migration/fixture writes, Auth/provider/browser calls, evidence path and cleanup permissions. This remains deferred.
7. **CLEAN-01 — Destruction:** separately authorize disposal of the isolated services/volumes/profile/evidence after successful guarded cleanup.

No single decision above implies another. Production integration, signup/manual-admission activation and deployment require later independent review and new owner authority.

## 11. Evidence produced in this batch

Executed only read-only/local hashing and document inspection. PF-SUP-04 verified 12/12 before documentation edits; afterward its eight implementation/configuration entries and report remain matching while three shared ledgers intentionally advanced. Migrations 000027–000032 retained their prior hashes. No tests were rerun because implementation was unchanged. No acceptance command in section 7 ran.

## 12. Stop condition and safety attestation

I3A design is complete only as a proposal. Stop for independent review of the new manifest. Provider feasibility and every protected execution gate remain open. AUTH-02 remains deferred.

No StoreFlow resource, database, migration, Auth/provider/network, Docker/service/port, credential, browser storage, installation, Git mutation, provisioning, signup, activation or deployment operation was accessed or performed. Dirty/untracked work, historical manifests, sealed migrations and protected financial/Refund V2/onboarding contracts were preserved.
