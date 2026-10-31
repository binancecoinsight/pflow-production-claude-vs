# PF-MVP-08 Foundation Acceptance Completion — PF-SUP-2026-10-29-04

Date completed: 2026-10-30 (Africa/Lagos). Status: local foundation package ready for independent review; no business-route wiring or protected execution performed.

## Migration 000035 provenance disposition

Three observations must not be collapsed into one baseline:

1. The accepted inventory correction snapshot recorded `000035` as `5de903ae018947818d161c1ce4651058f220849f7844a3680a82c5a8bfacb46f`. That inventory authorization explicitly treated entitlement files as read-only.
2. The later owner-authorized `PF-MVP-08 CONSOLIDATED MILESTONE MASTER PROMPT` authored the entitlement foundation. Its handoff and manifest record `000035` as `46a285069ea3a29b4e8c73ea3e8148f890b6e692df7581ce9c8ac8ebb5d8fb64`. PF-SUP-2026-10-29-03 also preserved that value. This is the documented authorized change lineage from the inventory observation to the foundation snapshot.
3. At the start of this batch, read-only inspection briefly observed an untracked 23,068-byte state at `8a43f9ea8ada906d82c20dcc3f920d04f11020dbbd3b96c72b3158683dea8235`, including a four-argument assertion overload and definer-owner caller trust. Before any edit to `000035`, the file changed externally to the documented 18,721-byte `46a285...` state. Git has no tracked blob or commit history for this untracked migration, so the transient writer cannot be attributed from repository evidence.

Current disposition: `000035` is byte-preserved at `46a285...`, matching the initial entitlement and PF-SUP-03 manifests. Neither historical manifest was changed. This batch did not restore, edit or normalize `000035`. Additive `000037` conditionally revokes the transient four-argument signature if it exists in a target while exactly revoking the baseline superseded helpers. Any future byte divergence requires owner direction before modification.

## Corrections completed

- Replay authorization now carries the complete validated proof scope. Final entitlement consumption rechecks pharmacy, operation kind, client operation ID, actor, device and payload fingerprint against the current request and lifecycle tenant. Legacy partial/boolean authorization shapes are rejected without throwing.
- Timestamp comparison now retains six RFC 3339 fractional digits as integer microseconds. Ordering matches PostgreSQL semantics: effective instant, sequence, then UUID; future decisions are excluded.
- The pure effective evaluator consumes the latest valid administrative decision. Suspension and negative mutation decisions override an active/renewed commercial lifecycle; reinstatement removes only the administrative overlay and cannot make an expired commercial period active.
- Additive unexecuted migration `20261030000037_entitlement_foundation_acceptance_completion_v1.sql` defines trusted decision/evidence producers, private exact replay proof, and `rpc_get_effective_entitlement_v2`. It closes superseded helper signatures and contains no definer-owner authorization bypass.
- The production injected adapter targets v2. No sale, refund, inventory, catalog, customer, supplier, cash, device or staff route is wired.

## Executed evidence

| Check | Exact result |
|---|---:|
| lifecycle synthetic | `15 passed` |
| capability boundary | `9 passed` |
| foundation adversarial regression | `49 passed` |
| affected entitlement regression | `1004 passed` |
| legacy static entitlement reconciliation | `61 passed` |
| PF-SUP-03 foundation static preservation | `11 passed` |
| PF-SUP-04 exact SQL/source static acceptance | `25 passed` |
| focused strict TypeScript | exit `0`, no diagnostics |
| root TypeScript | exit `0`, no diagnostics |

No SQL parser/database execution, RPC, browser/datastore, network, Auth/provider, concurrency, privileges/RLS or production behavior was exercised.

## Remaining foundation and approval gates

- The trusted committed-operation producer is authored but has no business-route producer calls; authoritative evidence population therefore remains an unimplemented dependency of future protected wiring.
- PostgreSQL parsing/execution, transactional producer atomicity, privilege/RLS and concurrency acceptance require explicit protected execution authorization.
- Business-route wiring, legacy callable policy and direct-table mutation enforcement require a separate owner scope after independent acceptance.
- The transient `8a43...` writer is not attributable from Git. If `000035` diverges again, owner direction is required; automatic restoration is prohibited.
- AUTH-02 remains deferred.

## Preservation

- `000035`: `46a285069ea3a29b4e8c73ea3e8148f890b6e692df7581ce9c8ac8ebb5d8fb64`
- `000036`: `d4073ad19f8654b5a9a951953a9ec9c272751da173f275b3ca2ef566429adf47`
- accepted inventory manifest: `be600c1f53aa4ca508b0162694af278f2b8f5568ef9ddf121cf6eb789cefef1f`
- accepted inventory service: `3bb0bc0fd47007a12553ad75767fab821bb0dc9acfb6ee20776e0c5151b40137`
- accepted inventory validation: `7c7bb6df87ff7bb781de9aee7a7439c11ebcdce2c91e6a30dd64ff4e120f5217`
- accepted POS orchestrator: `c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c`
