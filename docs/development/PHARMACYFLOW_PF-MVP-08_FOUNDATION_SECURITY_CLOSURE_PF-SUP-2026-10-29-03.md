# PF-MVP-08 Foundation Security Closure — PF-SUP-2026-10-29-03

## Authorization and scope

On 2026-10-29 the owner authorized one cohesive PF-MVP-08 foundation security closure batch: local source/test/document edits and an additive **unexecuted** SQL correction proposal. The same authorization prohibited database/SQL execution, RPC/network/Auth/provider/browser access, installation, Git mutation, provisioning, activation, deployment, StoreFlow access, changes to sealed migrations, and dependent server wiring. AUTH-02 remains deferred.

## Closure delivered

- The production entitlement adapter now binds authoritative evidence to the requested pharmacy, uses strict RFC 3339 parsing, requires complete ordered periods for non-UNKNOWN states, enforces state/flag/time consistency, sanitizes executor failures, and applies an injected 25–10,000 ms timeout.
- A pure exact-operation replay contract binds operation kind, client operation ID, pharmacy, actor, device, SHA-256 payload fingerprint, committed timestamp and distinct domain outcome identity. Pending/rejected/missing, cross-kind, changed-scope/hash and domain-ID substitution evidence fail closed.
- A pure administrative decision model orders by normalized instant, safe sequence and UUID, supports suspension/negative decisions and explicit reinstatement/allow decisions, and prevents renewal timing from overriding a later negative decision.
- Additive unexecuted migration `20261029000036_entitlement_foundation_security_closure_v1.sql` proposes private ledgers and helpers matching those contracts. It grants nothing to application roles and wires no route.
- The separate enforcement matrix enumerates the actual routes, grants, direct-table bypasses and future protected wiring.

## Evidence classification

Behavioral TypeScript: `foundationSecurity.test.ts` exercises production-used parser, adapter, replay authorization, evaluator and decision helpers. Existing `entitlement.test.ts` was reconciled to the evidence-bearing API. Static SQL: `entitlement-foundation-security.test.mjs` inspects proposal structure and preserved hashes only. Neither proves PostgreSQL behavior, concurrency, RLS, grants in a deployed database, or end-to-end enforcement.

Executed results: lifecycle `15 passed`; capability boundary `9 passed`; foundation security `24 passed`; existing entitlement `506 passed`; reconciled entitlement static wiring `61 passed`; static proposal/preservation `11 passed`; focused strict TypeScript exit `0`; root TypeScript exit `0`.

## Blocker disposition

PF-SUP-2026-10-29-03 foundation defects are locally corrected subject to independent review. Dependent server wiring remains intentionally blocked: the exact route-by-route enforcement migration, legacy route policy, direct-table mutation strategy, database execution, PostgreSQL concurrency/RLS/privilege evidence and AUTH-02 require new explicit protected authorization. The helpers must not be described as enforcement until that work is implemented and accepted.

## Preservation

- sealed `000035`: `46a285069ea3a29b4e8c73ea3e8148f890b6e692df7581ce9c8ac8ebb5d8fb64`
- accepted inventory correction manifest: `be600c1f53aa4ca508b0162694af278f2b8f5568ef9ddf121cf6eb789cefef1f`
- accepted inventory service: `3bb0bc0fd47007a12553ad75767fab821bb0dc9acfb6ee20776e0c5151b40137`
- accepted inventory validation: `7c7bb6df87ff7bb781de9aee7a7439c11ebcdce2c91e6a30dd64ff4e120f5217`
- accepted POS orchestrator: `c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c`

## Independent-review stop

No dependent server wiring is included. This package stops at the authorized foundation boundary.
