# BLK-002-I3 final boundary/parity correction report

Owner-referenced baseline: **PF-SUP-2026-10-26-04**  
Date: 2026-10-26  
Disposition: **CORRECTED LOCALLY — INACTIVE — UNEXECUTED — INDEPENDENT REVIEW REQUIRED**

## Authorization and preservation

The owner message `PHARMACYFLOW — I3 FINAL BOUNDARY/PARITY CORRECTION` explicitly authorizes this bounded local correction, one forward-only unexecuted SQL repair, focused tests/compilation and review evidence. It does not authorize database/migration execution, Auth/provider/network/browser/Docker access, credentials, provisioning, Git mutation, activation or deployment. PF-SUP-2026-10-26-04 is not present as a local review artifact; its detailed provenance and any broader approval remain unverified.

Migrations 000027–000031 and all historical manifests remain byte-identical. Correction SQL is isolated in `20261026000032_owner_gateway_boundary_parity_v1.sql`.

## Corrected boundaries

1. **Explicit RPC ACLs.** Migration 000032 revokes every 000031 v2 and new v3 RPC signature from `PUBLIC`, `anon`, `authenticated`, `service_role`, the opposite executor and the intended executor before selectively re-granting active RPCs to exactly one executor. Superseded identity v2 RPCs remain withdrawn. Static assertions are signature-specific.
2. **Global operation identity.** A forced-RLS `owner_security_operation_claims` ledger covers pending issuance attempts and completed security operations. Insert triggers enforce the same action, stable principal, applicant, context and command fingerprint. Issuance begin checks completed operations before pending attempts and reservation state, so cross-action, cross-principal and changed-command collisions fail before provider access. Other commands cannot take a pending issuance operation ID; transaction rollback preserves atomic effect/result/audit behavior.
3. **Recovery parity.** Issue completion requires current `IDENTITY_ISSUE`; recovery status and recovery completion require current `IDENTITY_RECOVER`. Recovery-only authority can finalize an already-created provider identity only after exact durable attempt/provider binding checks. It cannot invoke issuance, inspect by email or create. `UNKNOWN` and `PROVEN_ABSENT` both remain pending and never authorize creation.
4. **Compilation.** Exported assertion helpers are function declarations, removing TS2775. `tsconfig.i3.json` explicitly and strictly compiles the shared source, both façades, both injected tests and the static contract test. Root and focused compilation are reported independently.

## Executed evidence

| Check | Exact result | Evidence boundary |
|---|---:|---|
| Strict focused I3 TypeScript (`tsc -p tsconfig.i3.json`) | PASS | Six explicitly included I3 source/test files |
| Root application TypeScript (`tsc -p tsconfig.json`) | PASS | Existing root include set; I3 is separately compiled above |
| Corrected gateway injected tests | 33 passed | In-memory, sequential injected authority/repository/provider |
| Operator injected tests | 25 passed | In-memory sequential transaction model |
| I3 static ACL/boundary contract | 84 passed | SQL/source text and sealed hashes; no ACL execution |
| Corrected I2 injected contract | 44 passed | In-memory specification |
| Issuer injected tests | 39 passed | Mock repository/provider |
| Issuer static/synchronous checks | 53 passed | No PostgreSQL concurrency |
| Onboarding static/synchronous checks | 28 passed | Includes consumed-result protections; no SQL execution |

New gateway regressions cover both operation-ID collision orderings, pending changed-command and cross-principal conflicts, provider-call counts, response loss, restart uncertainty, issue-only/recovery-only/revoked/underprivileged/rotated credentials, pending finalization and completed exact replay. Existing operator, I2 and issuer suites retain revoked-state, rollback, consumed immutability and authorized exact consumed-result recovery evidence.

The only emitted diagnostics were Node's experimental-loader deprecation warnings. No dependency installation occurred.

## SQL reasoning versus unexecuted acceptance

Migration 000032 source places completed-operation lookup before pending-attempt lookup and authoritative reservation validation. Global claim triggers make pending/completed identity one namespace, and all state/evidence mutations remain transaction-scoped. Signature-specific text assertions demonstrate the proposed ACL statements exist.

None of this proves PostgreSQL syntax/application, default/effective ACLs, forced-RLS behavior, trigger scheduling, rollback under real faults, deadlock freedom or overlapping transaction outcomes. No PostgreSQL/Auth/provider/browser/network/concurrency acceptance ran. AUTH-02 remains deferred.

## Open blockers and next boundary

- Authority registry administration, identity provisioning, credentials, JWT/runtime mapping and rotation ceremonies remain absent and require an owner choice.
- Real provider exact-operation recovery, trusted metadata and confirmed-account continuation remain unverified.
- Migration 000032 and the full 000027–000032 chain require independent source review before any separately authorized disposable acceptance.
- Signup, runtime adapters and production integration remain inactive.

Stop here for independent review. Do not begin I3A or dependent work. A future scope must separately authorize an exact snapshot and either source-only authority-provisioning design or a named disposable acceptance target; this package authorizes neither.

## Safety attestation

No StoreFlow resource was accessed. No database, migration, Auth/provider/network, Docker/service/port, credential, browser-storage, installation, Git mutation, activation or deployment operation occurred. Unrelated dirty/untracked work, sealed financial/Refund V2/onboarding contracts and consumed history were preserved.

The shared progress, decision and roadmap ledgers intentionally advance in the new manifest. Historical manifest files remain untouched and continue to describe their earlier snapshots.
