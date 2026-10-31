# PharmacyFlow Entitlement Wiring Contract-Parity and Pre-Execution Readiness — PF-SUP-2026-10-30-01

## Owner scope and milestone disposition

The owner authorized one local source/synthetic correction and reconciliation milestone on 2026-10-30. It permits local source/test/document edits and additive unexecuted SQL correction proposals. It does not authorize editing existing migration bytes, SQL/database execution, RPC/network/browser/Auth access, credentials, installation, Git mutation, provisioning, activation or deployment. AUTH-02 remains deferred.

The existing PF-MVP-09/R/S handoff cites only proposed owner authorizations. This batch does not retroactively treat those proposals as authority. Its 128 KB consolidated migration is preserved and quarantined. No additive later migration can make the chronological chain runnable because PostgreSQL must parse the earlier file first.

Provenance is unstable and not attributable through Git because the migration is untracked. Historical PF-MVP-09/R manifests record `9d8cc892...`; PF-MVP-09S records `b2f62b98...`. Read-only observations during this batch then saw `b2f62b98...`, `87466cd4...`, and finally `279376c9a1d94205e62ceba49d349b76c9c69c21f1ec6c2cf1dde5e393de7ce6` without this batch editing the file. The final scoped manifest pins the last observed bytes; no historical manifest is rewritten.

## Corrected findings

1. `20261029000037_consolidated_entitlement_enforcement_v1.sql` has four lexical structure failures: line 54 has `DO` without a quoted body; lines 80, 317 and 554 use malformed `AS $` delimiters. No installed isolated PostgreSQL parser was available. A local lexer checks comments, strings, quoted identifiers, nested block comments, dollar tags and explicit DO/AS structure. PostgreSQL parsing/application remains **NOT RUN**.
2. The proposed M-18 replacement omits atomic nonce consumption, sealed actor authorization and controlled-deficit accounting.
3. The proposed Refund V2 replacement is based on an earlier approximation: it omits nonce handling, `sale_return_line_allocations`, `contract_version`, reconciliation guards, the M-22 deterministic item-lock/duplicate correction and M-23 `FOR UPDATE OF sj` replay correction.
4. The proposed intake function writes purchase status `RECEIVED`; the sealed schema permits `COMPLETED`, `PENDING`, `CANCELLED`, and the accepted client response requires `COMPLETED`. Validators were not weakened.
5. Transfer replacements lose sealed permission paths. Multiple inventory/staff grants omit exact signatures, making overload disposition ambiguous.
6. Gateway trust remains a role-string/claim proposal and the trusted committed-evidence producer is not atomically called by business transactions. Full actor/tenant/branch/device proof therefore is not implemented.
7. The clean foundation v2 proposal is chronologically behind the malformed competing migration and is not reachable by normal application.

## Regression evidence

`entitlement-contract-parity.test.mjs` performs structural and ordered-contract assertions, not assertion-count acceptance. It verifies the sealed M-18 nonce/claim/locking/accounting paths; composes Refund V2 expectations across M-20 through M-25; verifies intake status/arithmetic/idempotency; adjustment/transfer permissions and arithmetic; staff invitation lifecycle and exact grants; and proves the candidate omissions. It also verifies the foundation proposal is structurally balanced.

Executed results: lifecycle `15 passed`; capability boundary `9 passed`; foundation adversarial `49 passed`; entitlement regression `1004 passed`; baseline static `61 passed`; foundation static `11 passed`; foundation acceptance static `25 passed`; prior enforcement static `90 passed`; composed parity/readiness `79 passed; quarantined structure errors: 4`; focused/root TypeScript compilation exit `0`.

Existing subscription synthetic suites, focused/root compiler checks and preservation verification are recorded in the new manifest. No broad unchanged suites were rerun.

## Exact remaining owner gate

One explicit source-authoring decision is required before further correction: authorize either (a) replacement-in-place of `20261029000037_consolidated_entitlement_enforcement_v1.sql` while preserving its current hash in historical evidence, or (b) moving/renaming it outside the executable migration namespace and authoring a new uniquely versioned parity migration from the latest sealed definitions. The authorization must also name whether legacy return routes remain callable and select the design for direct-table mutations.

Only after that source decision and independent review can a separate exact disposable PostgreSQL target/execution authorization be requested. This package does not request or imply execution authority.
