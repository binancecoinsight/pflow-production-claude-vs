# PharmacyFlow BLK-002 REV-LIN-01 PF-SUP-2026-10-26-15 security correction

Date: 2026-10-26  
Baseline: `main` / `f36985ef7d23aa414e473cb8e79777a429fee375`  
Reviewed predecessor manifest: `f717f71bf7e5f5af81a56513091a0f50bca12799d79016e5a23294682d7726ee`  
Preserved migration 000033: `1065386b66fcc3b03b4a9e3026869b6aee4ebeeea6c572ead9d7e3ac0ec8477f`  
Classification: owner-authorized local correction; PostgreSQL/Auth/provider/browser/concurrency not run

## Corrected findings

1. **Issue-route principal binding.** The injected authoritative repository and proposed SQL now require the current `IDENTITY_ISSUE` actor's stable principal ID to equal the attempt's immutable original principal for provider dispatch, completion (including replay), and completed-result lookup. A second issue-capable principal receives `ORIGINAL_ISSUE_PRINCIPAL_REQUIRED` before phase audit, result disclosure or effect.
2. **Recovery remains separate.** `IDENTITY_RECOVER` does not apply the issue-principal equality rule. A different current recovery principal still requires an explicit active capability/applicant/context scope and may only resolve the stored operation. Recovery code remains structurally unable to create a provider identity.
3. **Credential rotation.** The boundary compares stable principal IDs, not credential versions. Current registry/version checks still run at phase entry, while operation authorship and the original credential version remain unchanged.
4. **Fail-closed injected scopes.** Missing scope maps, missing grants, inactive grants, wrong-capability grants, wrong-applicant grants and wrong-context grants all deny. Every permitted synthetic identity receives explicit grants.
5. **Completion parity.** An exact completed retry returns the stored canonical result. Changed subject or provider-operation correlation conflicts. Stale/revoked authority fails before disclosure. Required audit failure leaves no completed operation and no false replay.

## SQL repair

The new forward-only migration `20261026000034_owner_identity_issue_principal_binding_v1.sql` is authored but unexecuted. It replaces only the three private 000033 phase functions at the catalog level:

- `private_i3_authorize_identity_phase_v1`
- `private_i3_complete_owner_identity_v3`
- `private_i3_lookup_owner_identity_v1`

The existing public 000033 wrappers therefore receive the corrected authoritative checks without a parallel weaker route. Migration 000034 reasserts SECURITY DEFINER ownership, private-function closure, every superseded identity RPC revocation, and exact public-RPC revocation/regrant to only `pharmacyflow_owner_gateway_executor`. It provisions no principal, credential or authority scope.

Migrations 000027–000033 remain byte-identical to their reviewed hashes.

## Executed local verification

| Check | Exact result | Limitation |
|---|---:|---|
| Strict focused I3 compilation | PASS, exit 0 | Local compiler only |
| Root application compilation | PASS, exit 0 | Root include set only |
| Gateway injected model | `64 passed` | Sequential in-memory model |
| Operator injected model | `25 passed` | Existing sequential in-memory model |
| I3 static SQL/source/ACL contract | `160 passed` | Source text and hashes; no SQL parser/database |
| Scoped `git diff --check` | PASS | Tracked whitespace check only |
| Scoped SHA-256 manifest | all entries matched | Local file integrity only |

Focused regressions prove second-principal ISSUE denial for dispatch, completion and completed-result disclosure; same-principal rotated result lookup; scoped cross-principal recovery; no-create recovery; every scope-grant negative class; canonical completed retry; changed correlation conflicts; stale/revoked denial; and audit-failure rollback.

## Evidence boundary and next gate

No SQL or migration was parsed or executed. No target, database, fixture, RPC, ACL/RLS, transaction rollback, lock/concurrency, credential, Auth/provider/browser, network, Docker, service/port, runtime mapping, provisioning, signup, activation, deployment, environment destruction, Git mutation or StoreFlow access occurred.

Migration 000034 and all behavior remain subject to independent source review and later separately authorized PostgreSQL acceptance. AUTH-02 remains deferred.
