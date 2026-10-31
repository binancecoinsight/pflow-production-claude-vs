# PharmacyFlow disposable PostgreSQL entitlement acceptance proposal

Status: proposal only; unexecuted; no target, identity, credential, port or runtime is owner-approved.

## Authorization prerequisites

Execution may begin only after independent acceptance of the source package and a new owner instruction naming:

1. the exact disposable target/environment identity and permitted runtime;
2. the exact operator identity and credential-delivery mechanism;
3. permission to create or access that target and apply the immutable migration inventory below;
4. permission to run the bounded SQL scenarios and capture the listed evidence;
5. separate permission for fixture cleanup; and
6. separate permission for environment destruction. Cleanup permission does not imply destruction permission, and cancellation does not imply either.

AUTH-02 and direct-table enforcement policy remain outside this proposal.

## Immutable prerequisite inventory

The future run must verify the accepted manifest before doing anything and apply these active files, in this exact filename order, to an empty approved target:

```text
20261003000000_foundation_v1.sql
20261004000001_m1_identity_security.sql
20261004000002_m2_membership_roles.sql
20261004000003_m3_billing_subscriptions.sql
20261004000004_m4_devices_crypto.sql
20261004000005_m5_inventory_ledger.sql
20261004000006_m6_sync_audit.sql
20261004000007_m7_final_security.sql
20261005000008_m8_cashier_sales_rls.sql
20261005000009_m9_returns_refunds.sql
20261005000010_m10_offline_return_sync.sql
20261005235959_customer_schema_compatibility.sql
20261006000011_m11_customers_management.sql
20261006000012_m12_tender_integrity.sql
20261006000013_m13_inventory_receiving.sql
20261007000014_m14_inventory_adjustments.sql
20261007000015_m15_stock_transfers.sql
20261011000016_m16_staff_management_rpcs.sql
20261012000017_postsealed_registration_and_tenant_rls.sql
20261012000018_unified_sales_commit.sql
20261012000019_financial_inventory_corrections.sql
20261013000020_refund_v2_authoritative_commit.sql
20261013000021_refund_v2_locking_correction.sql
20261013000022_refund_v2_item_lock_correction.sql
20261013000023_refund_v2_replay_ambiguity_correction.sql
20261013000024_refund_v2_device_lookup_grant.sql
20261013000025_refund_v2_gateway_claim_compatibility.sql
20261014000026_client_operation_status_v2.sql
20261025000027_owner_onboarding_v1.sql
20261025000028_owner_eligibility_issuer_v1.sql
20261025000029_owner_eligibility_recovery_v1.sql
20261026000030_owner_gateway_operator_contract_v1.sql
20261026000031_owner_gateway_operator_correction_v1.sql
20261026000032_owner_gateway_boundary_parity_v1.sql
20261026000033_owner_identity_recovery_linearization_v1.sql
20261026000034_owner_identity_issue_principal_binding_v1.sql
20261029000035_server_authoritative_entitlement_v1.sql
20261029000036_entitlement_foundation_security_closure_v1.sql
20261030000037_entitlement_foundation_acceptance_completion_v1.sql
20261030000038_canonical_entitlement_contract_parity_v1.sql
20261030000039_entitlement_contract_closure_v1.sql
```

The quarantined malformed version-37 proposal is not an executable prerequisite. No historical manifest path is applied as SQL.

## Exact callable/grant inventory to prove after composition

| Signature | Expected direct role |
|---|---|
| `rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID)` | `authenticated` through guarded M-9 wrapper |
| `rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT)` | `authenticated` through guarded M-10 wrapper |
| `rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT)` | `service_role` only |
| `rpc_commit_sale_v1(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB)` | `service_role` only |
| `rpc_ingest_sale_stock_movement(UUID,UUID,UUID,UUID,UUID,UUID,UUID,INT,TEXT)` | `service_role` only |
| inventory intake/adjustment/dispatch/receive exact signatures recorded in the accepted grant matrix | `authenticated` through guarded wrappers |
| six M-16 staff signatures recorded in the accepted grant matrix | `authenticated` through guarded wrappers |

Every `_entitlement_base` and private resolver/fingerprint/evidence helper must have no API-role execution grant. Superseded foundation helpers remain revoked. Definer ownership, `session_user` and `current_user` are not initiating-operator proof.

## Bounded scenarios

1. Parse/apply the complete immutable chain and verify catalog signatures, dependencies and effective ACLs.
2. Compare `rpc_get_effective_entitlement_v2` with every mutation guard for active, trial, grace, exact grace boundary, expired, missing evidence, historical suspension, later reinstatement, later denial, future decision and timestamp/sequence/UUID ties.
3. Exercise M-9, M-10 and Refund V2 normal financial behavior, tenant/branch/permission failures and unchanged response contracts.
4. Exercise exact committed replay after expiry and reject cross-pharmacy, cross-branch, cross-kind, changed actor/device/fingerprint and pending/rejected evidence.
5. Prove M-13 reordered/default-equivalent intake retry returns the original result; material quantity, price, supplier, invoice, product, batch or expiry changes conflict.
6. Repeat equivalent/conflicting retry checks for adjustment, dispatch and receive.
7. Force committed-evidence insertion failure after delegated mutation and prove the entire statement rolls back: no purchase/adjustment/transfer/sale/return, ledger, journal, nonce or evidence residue.
8. Run bounded two-session idempotency/locking cases for sale, Refund V2 and inventory operations. PostgreSQL results, not injected models, decide atomicity/concurrency acceptance.
9. Verify historical reads remain available in restricted entitlement states without weakening tenant/RLS rules.

Direct-table mutation enforcement is observation-only until its separate policy gate is resolved.

## Evidence package

Capture immutable input manifest, target identity supplied by the owner, PostgreSQL/runtime versions, migration ledger, function definitions, `proacl`/owner/search-path evidence, RLS/policy inventory, exact commands, per-scenario SQLSTATE/results, transaction residue counts, concurrency timelines, logs with secrets removed, cleanup results and a final output manifest. Clearly separate expected failures from harness/infrastructure failures.

## Abort and cancellation

Abort before mutation if target identity/authorization is absent, any checksum differs, the target is nonempty or non-disposable, credentials or endpoints do not match the approved target, external network access would be required, StoreFlow is visible/in scope, prerequisite parsing fails, or unexpected migrations/services/ports are present. Abort the run on migration failure, unexpected grant/owner, fixture escape, unbounded lock, timeout, evidence redaction failure or user cancellation.

On abort or cancellation: stop new work, preserve diagnostics, and perform no cleanup or destruction unless the owner separately authorized that action. Fixture cleanup and environment destruction are distinct terminal operations with distinct evidence.
