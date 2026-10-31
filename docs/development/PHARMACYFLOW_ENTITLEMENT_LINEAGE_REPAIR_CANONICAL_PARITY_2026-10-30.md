# PharmacyFlow entitlement lineage repair and canonical contract-parity completion

Date: 2026-10-30  
Disposition: complete for independent source/synthetic review; unexecuted SQL

## Outcome

The malformed active proposal was moved, not deleted, to provenance quarantine after verifying that the destination did not exist. Its pre-move and post-move SHA-256 are identical: `279376c9a1d94205e62ceba49d349b76c9c69c21f1ec6c2cf1dde5e393de7ce6` (130,769 bytes). Historical manifests remain unchanged.

The active chronological chain is now:

1. `20261029000035_server_authoritative_entitlement_v1.sql`
2. `20261029000036_entitlement_foundation_security_closure_v1.sql`
3. `20261030000037_entitlement_foundation_acceptance_completion_v1.sql`
4. `20261030000038_canonical_entitlement_contract_parity_v1.sql`

Migration 38 is additive and unexecuted. It renames each latest effective sealed mutation function to a private base, revokes base execution from all API roles, and recreates the original exact signature as a guarded delegating wrapper. This preserves M-18, Refund V2 corrections M-21 through M-25, inventory arithmetic/permissions/statuses, transfer lifecycle and staff invitation/member lifecycle without copying an earlier approximation.

## Security and parity closure

- Service-gateway sale/refund routes bind actor, pharmacy, branch, device, operation kind, client operation and SHA-256 fingerprint through request headers and explicit RPC parameters. Role/definer ownership alone is insufficient.
- Replay authorization and committed evidence use the complete same scope plus committed domain identity/timestamp. Unknown operation kinds, malformed header UUIDs, pending/rejected evidence and identity/fingerprint conflicts fail closed.
- Direct authenticated inventory/staff routes require the initiating `auth.uid()` and active tenant/branch membership before entitlement evaluation; their preserved bases retain the narrower sealed permission checks.
- Invitation acceptance remains available to the invited authenticated user. The preserved base remains authoritative for token, email, expiry, seat and lifecycle checks; the wrapper adds only the pharmacy entitlement decision.
- The legacy return RPC remains callable by `authenticated`. It receives equivalent entitlement protection and records replay evidence only when the existing request actually supplies a valid client operation and fingerprint.
- No direct-table mutation protection is claimed. Choosing trigger enforcement, additional FORCE RLS policy, or API removal is a protected database policy/execution decision.

## Executed local checks

| Check | Result |
|---|---:|
| Contract-parity/source regression | 114 passed; quarantined defects detected: 4 |
| Canonical migration/gateway wiring regression | 92 passed |
| Foundation security static | 11 passed |
| Foundation acceptance static | 25 passed |
| Existing entitlement wiring static | 61 passed |
| Subscription lifecycle | 15 passed |
| Capability boundary | 9 passed |
| Foundation behavioral/adversarial | 52 passed |
| Entitlement behavioral matrix | 1,004 passed |
| Sale gateway crypto/order/idempotency | 70 passed |
| Focused strict TypeScript | pass, 0 diagnostics |
| Root TypeScript | pass, 0 diagnostics |

The SQL check is lexical source inspection only. PostgreSQL parsing and application were not run. No database, SQL execution, RPC, real browser/datastore, network, Auth/provider, credentials, Docker/services/ports, installation, Git mutation, provisioning, activation, deployment or StoreFlow access occurred.

## Remaining gates

Independent review must accept this source package before any execution. The next smallest protected authority is one named disposable PostgreSQL target plus permission to parse/apply this exact migration chain and run bounded schema/signature/grant/RLS/transaction/concurrency checks. Direct-table enforcement policy must be explicitly selected before it can be claimed. AUTH-02 remains deferred.
