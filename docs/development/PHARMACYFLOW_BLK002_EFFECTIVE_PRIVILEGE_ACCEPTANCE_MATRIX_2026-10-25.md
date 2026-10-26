# BLK-002 effective-privilege acceptance matrix

Checkpoint: **PF-SUP-2026-10-25-15**  
Status: **DESIGN/INSPECTION MATRIX — NOT EXECUTED**

This matrix traces the currently reviewed owner-onboarding migration and the proposed issuer design. Declared grants and model success are not evidence of effective PostgreSQL behavior.

## A. Migration executor prerequisites

Before execution, an approved disposable target must prove the migration executor can perform exactly these operations:

| Migration statement class | Required executor authority | Abort condition |
|---|---|---|
| Read `pg_roles` | Catalog visibility sufficient to prove exact role absence | Role visibility incomplete or `pharmacyflow_onboarding_owner` already exists. |
| `CREATE/ALTER ROLE ... NOLOGIN NOINHERIT NOBYPASSRLS` | `CREATEROLE` or superuser-equivalent migration authority | Executor cannot set/verify all attributes, or role memberships/default privileges are unknown. |
| `GRANT USAGE ON SCHEMA public, auth` | Schema owner or grant option | Any broader schema privilege is required. |
| Column grants on `auth.users` | Table owner or column grant option accepted by target | Hosted platform forbids grant or silently broadens it. |
| Column grants on public tables | Table owner/grant option | Effective ACL differs from the listed columns. |
| Create table, functions, policies and trigger | `CREATE` on `public`, ownership/alter rights on affected objects | Existing object/name collision, unexpected owner, or inability to force RLS. |
| Change table/function owner | Membership in target role plus required schema authority, or superuser | Executor must grant role membership that persists beyond migration, or ownership change fails. |
| Replace `handle_new_user()` | Ownership of existing function and compatibility with existing Auth trigger | Function OID/signature, trigger binding or current owner differs from reviewed assumptions. |
| Grant RPC execute to `authenticated` | Function owner/grant option | PUBLIC/anon retain execute or additional grantees appear. |

The migration must run in one transaction or abort. Afterward, the executor must not remain a member of either onboarding role unless explicitly required and reviewed. Default privileges for the executor, function owner, `public`, `anon`, `authenticated` and `service_role` must be inspected; unexpected inherited/default privileges abort acceptance.

## B. Runtime statement trace: profile-only trigger

Function: `public.handle_new_user()`, SECURITY DEFINER owner `pharmacyflow_onboarding_owner`, fixed `search_path = public, pg_temp`.

| Statement/expression | Required effective privilege/function | RLS/ownership interaction | Acceptance proof |
|---|---|---|---|
| Read `NEW.id`, email and raw user metadata | Trigger-row access supplied by Auth insert | Must not imply direct `auth.users` table mutation authority | Insert test through real Auth lifecycle. |
| `trim`, `NULLIF`, `COALESCE`, `timezone`, `now` | Built-in execution available | Fixed search path must not resolve attacker objects | Inspect `pg_proc` resolution and run malicious-shadow negative case. |
| INSERT profile columns | Column INSERT on `user_profiles` | Current source shows no profile RLS; acceptance must inspect actual `relrowsecurity`, policies and owner | Confirm one profile and zero tenant/membership/subscription effects. |
| `ON CONFLICT ... DO UPDATE` | Column UPDATE plus any SELECT required by target PostgreSQL | Existing row ownership/RLS must not broaden writes | Existing-profile conflict case updates only allowed columns. |
| Trigger invocation | Existing enabled Auth trigger bound to exact function OID/signature | Trigger functions do not use ordinary client EXECUTE semantics; verify on target | Inspect `pg_trigger`, `pg_proc`, owner and enabled state. |

Any RLS on `user_profiles`, extra trigger, or incompatible Auth-managed ownership is an abort until separately reviewed.

## C. Runtime statement trace: OWNER RPC

Function: `public.rpc_create_pharmacy_owner_v1(UUID,TEXT,TEXT)`, SECURITY DEFINER owner `pharmacyflow_onboarding_owner`, execute proposed only for `authenticated`.

| RPC operation | Required effective privilege | Policy/function interaction | Required negative proof |
|---|---|---|---|
| `auth.uid()` | EXECUTE/resolution of `auth.uid()` and authentic JWT request context | SECURITY DEFINER changes `current_user` but must not change `auth.uid()` result | anon/null subject denied; subject cannot be spoofed through client-accessible settings. |
| SELECT `auth.users(id,email_confirmed_at,raw_app_meta_data)` | Exact column SELECT | No email/credential access | Unconfirmed, staff-class and mismatched metadata denied. |
| `digest`, `convert_to`, JSONB/built-ins, UUID/time generation | Exact resolved functions (`digest` schema must be known) | Fixed search path and extension location must match target | Shadowed-function and missing-extension abort cases. |
| INSERT request reservation | Table ownership plus INSERT; FORCE RLS | Dedicated role owns table but FORCE RLS subjects owner; policy requires `user_id=auth.uid()` and version | Cross-subject insert/select/update denied. |
| SELECT request `FOR UPDATE` | SELECT and row-lock authority | Same FORCE-RLS policy; composite subject/request scope | Cross-subject replay invisible/denied; exact row serialized. |
| UPDATE request completion | UPDATE | Immutable trigger permits only PENDING→COMPLETED fields; FORCE RLS still applies | Fingerprint/version/identity and completed-row mutation denied. |
| INSERT pharmacy | Listed column INSERT; SELECT `(id,owner_id)` is used by downstream policies | Existing PUBLIC insert policy is `FALSE`; new role policy is permissive and OR-combined, requiring `owner_id=auth.uid()` | Other owner ID and direct authenticated insert denied. |
| INSERT branch | Listed column INSERT | Existing PUBLIC owner/manager policy is false before membership; role-specific policy subquery reads pharmacy under FORCE RLS | Cross-pharmacy branch denied; policy subquery sees only caller-owned row. |
| INSERT subscription | Listed column INSERT | Existing public SELECT policy does not authorize INSERT; new role policy checks owned pharmacy | Cross-pharmacy and client direct insert denied. |
| INSERT OWNER membership | Listed column INSERT | Existing PUBLIC owner policy is initially false; role policy fixes subject, OWNER/ACTIVE and owned pharmacy | Different user, role, status or tenant denied. |
| Return/store canonical response | Request UPDATE plus JSONB built-ins | Response and completion must commit with every tenant effect | Fault after each effect leaves zero rows and no completed request. |

## D. Effective-policy interaction inventory

PostgreSQL permissive policies are OR-combined. Policies declared without `TO` apply to PUBLIC and therefore also to the dedicated role. Acceptance must enumerate every policy from `pg_policy`, not only the new policy names, and evaluate the union:

- `pharmacies`: existing membership/platform-admin SELECT and deny-all INSERT coexist with dedicated owner SELECT/INSERT.
- `branches`: existing member/management policies coexist with dedicated INSERT.
- `subscriptions`: existing member/platform-admin SELECT coexists with dedicated INSERT.
- `pharmacy_members`: existing membership SELECT and OWNER INSERT coexist with dedicated INSERT.
- `owner_onboarding_requests`: only the dedicated role policy is expected; any other policy aborts.

Policy helper functions such as `is_pharmacy_member`, `is_platform_admin` and `has_pharmacy_role` may execute while evaluating PUBLIC policies. Inspect their owners, SECURITY DEFINER flags, fixed search paths and effective EXECUTE grants. Their false result must not error or broaden the onboarding role.

`FORCE ROW LEVEL SECURITY` is currently expected on pharmacies, branches and owner requests. Subscriptions and memberships are expected RLS-enabled with the function owner not owning those tables. Any target difference changes the proof and aborts acceptance.

## E. Issuer role additions proposed for a later authoring batch

A separate `pharmacyflow_owner_eligibility_issuer` role is proposed as `NOLOGIN NOINHERIT NOBYPASSRLS`. It would own only a private eligibility ledger and issuer functions. No direct client role receives table privileges. A future Edge gateway would receive execute only on narrowly typed reserve/recover/observe functions through a dedicated service identity; use of broad `service_role` is an unresolved exception and is not approved. The onboarding RPC owner would receive only the minimum SELECT/claim columns needed to verify/consume active eligibility.

## F. Mandatory metadata capture

Future acceptance records exact server version; object owners; role attributes/memberships; schema ACLs; table- and column-level ACLs; default ACLs; function signatures/owners/security/search paths/ACLs; RLS/FORCE flags; every applicable policy; trigger bindings; extension/function schemas; and migration transaction behavior. Missing visibility or any effective privilege not represented here is an abort—not a waiver.
