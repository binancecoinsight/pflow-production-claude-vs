# PharmacyFlow BLK-002 ACC-01 assertion closure — PF-SUP-2026-10-26-17

Date: 2026-10-27  
Baseline: owner-approved PF-SUP-2026-10-26-16 package  
Status: **LOCALLY CORRECTED — POSTGRESQL NOT RUN — INDEPENDENT REVIEW REQUIRED**

## Bounded changes

- The closed-route ACL table now includes the exact retired v2 begin, completion and recovery signatures. PUBLIC, `anon`, `authenticated`, `service_role`, `pharmacyflow_owner_gateway_executor` and `pharmacyflow_platform_admission_operator` must all lack execution.
- Static regression extracts the complete superseded identity-signature set revoked by migrations `000033`–`000034` and requires exact equality with the ACL matrix. The reviewed chain contains nine unique retired signatures.
- A pure, side-effect-free `identity-response.ts` validator and matching rollback-only SQL assertion require an object response with:
  - exact string state `PROVIDER_PENDING`;
  - a present `result` field whose value is JSON null;
  - an exact positive integer original credential version;
  - complete, typed and exact original operation/action/principal/applicant/context/fingerprint identity;
  - a typed, exact provider-operation binding.
- SQL NULL, top-level JSON null, arrays, missing fields, nested JSON null, wrong types and wrong values fail closed. A missing pending-result field is rejected while a present JSON-null result remains valid.

No application/security source or migration was changed. Migrations `000027`–`000034`, accepted corrections, historical manifests and unrelated work remain preserved. No new migration was authored.

## Focused local evidence

| Check | Exact result | Classification |
|---|---|---|
| Synthetic response/preflight test | `ACC-01 PF-SUP-17 assertion-closure synthetic tests: passed (16 zero-executor preflight rejections; 26 malformed identity responses rejected)` | Pure/injected; zero external calls |
| Static source test | `ACC-01 PF-SUP-17 assertion-closure source static tests: passed (9 retired identity signatures; fail-closed response guards)` | Static source only |
| Focused TypeScript compilation | exit `0`, no diagnostics | Local compiler only |
| PowerShell parser | `ACC-01 PF-SUP-17 PowerShell parser-only checks: passed (11 files)` | Parser only |

The SQL negative cases are authored but unexecuted. Static and synthetic results do not establish PostgreSQL parsing, ACL behavior or response behavior.

## Open acceptance and approval boundary

PostgreSQL execution, ACL/RLS evaluation, fixture/assertion/cleanup execution, concurrency, Auth/provider/browser behavior and production acceptance remain **NOT RUN**. Successful identity completion, completed replay and completion-audit rollback remain `BLOCKED_AUTH_02`. AUTH-02 remains deferred. The next action is independent review of the new scoped manifest; no protected execution, provisioning, activation or deployment is authorized.
