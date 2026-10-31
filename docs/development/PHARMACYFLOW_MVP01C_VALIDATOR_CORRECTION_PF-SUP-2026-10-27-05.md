# PharmacyFlow MVP-01C validator correction

Checkpoint: PF-SUP-2026-10-27-05

Date: 2026-10-27

Disposition: **LOCAL SOURCE/SYNTHETIC CORRECTION COMPLETE - INDEPENDENT REVIEW REQUIRED**

## Authorization and preservation

The owner authorized one bounded local correction to the MVP-01C response validator, focused regressions, compilation, records and a new scoped manifest. The previously accepted RPC invocation, workspace/publication guards, OWNER/MANAGER containment, immutable publication and UI states were not reopened.

The original MVP-01C handoff and manifest were preserved unchanged. No migration, Auth contract, invitation mutation, storage behavior, protected contract or unrelated work was modified. AUTH-02 remains deferred.

## Corrected findings

### M-16 email parity

M-16 constrains `staff_invitations.email` to `email = lower(trim(email))` and `position('@' in email) >= 2`. The prior client regular expression additionally required a dot in the domain. That rejected valid server evidence such as `staff@localhost` despite the RPC contract accepting it.

The production validator now checks the existing M-16 requirements without adding a dotted-domain rule: the value must be a string, already equal to its trimmed lowercase form, and contain `@` after at least one preceding character. The server contract is unchanged.

Secret-shaped values are still rejected before any allowlisted row can publish. Missing/extra fields, duplicate IDs, cross-pharmacy rows and every other whole-response guard remain unchanged.

### Calendar and time validation

The prior timestamp check combined an RFC3339-shaped expression with `Date.parse`. JavaScript parsing may normalize impossible calendar input, so shape plus a finite result was not sufficient evidence.

The validator now extracts and checks:

- Gregorian year, month and day with the complete divisible-by-4 / century / divisible-by-400 leap-year rule;
- actual days per month;
- hours `00`-`23`, minutes and seconds `00`-`59`;
- numeric offset hours `00`-`23` and minutes `00`-`59`, or `Z`;
- optional fractional seconds from one through six digits, matching PostgreSQL microsecond precision.

Valid `Z`, positive-offset, negative-offset and fractional PostgreSQL representations remain accepted. Impossible dates and invalid time/offset components fail the whole response closed.

## Preserved behavior

- The runtime executor still calls only `rpc_list_staff_invitations` with the coherent workspace `p_pharmacy_id`.
- Exact ten-field/nullability validation and frozen allowlisted results are unchanged.
- Server-reported `PENDING`, `ACCEPTED`, `REVOKED` and `EXPIRED` statuses are never rewritten.
- Past-expiry display remains a separate, labelled, injected-clock derivation for server-PENDING rows.
- Workspace identity, membership version, pharmacy, branch and role freshness checks remain unchanged.
- Refresh, workspace change, sign-out and unmount invalidation remain unchanged.
- The panel, `AuthenticatedShell`, `StaffInvitationForm`, navigation and all mutation paths are unchanged in this correction.

## Executed isolated verification

1. `node --loader ./scripts/typescript-loader.mjs src/lib/auth/staffInvitationOversight.test.ts`
   - PASS: `Staff invitation oversight tests: 58 passed`.
   - New cases cover M-16-compatible `staff@localhost`; 2024 and 2000 leap-day acceptance; 2026 and 1900 non-leap rejection; impossible month days; zero day; invalid hour/minute/second; invalid offset hour/minute; positive and negative offsets; one- and six-digit fractional seconds; and rejection beyond PostgreSQL microsecond precision.
   - Existing cases reconfirm whole-response rejection, secret-bearing rejection, immutability, unchanged server status, injected-clock derivation and stale-publication containment.
2. `node scripts/acceptance/staff-invitation-oversight-wiring.test.mjs`
   - PASS: `Staff invitation oversight wiring tests: 35 passed`.
3. `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.staff-invitation-oversight.json --noEmit`
   - PASS: exit code 0, no output.
4. `node node_modules/typescript/bin/tsc --noEmit`
   - PASS: exit code 0, no output.
5. Scoped SHA-256 verification
   - PASS: `8/8` manifest entries matched.
   - PASS: scoped trailing-whitespace check.
   - The historical MVP-01C manifest file remains unchanged at SHA-256 `c7911287a9fd35835ffed1f85046c3afe54d5a45e4c9a9aefd43c02cac1229b1`.
   - `StaffInvitationOversightPanel.tsx` and `AuthenticatedShell.tsx` still match their accepted MVP-01C manifest hashes; `StaffInvitationForm.tsx` remains unchanged from the repository baseline.

An initial preservation command incorrectly compared the accepted dirty MVP-01C UI files directly with repository HEAD and therefore reported an out-of-scope difference. The corrected read-only preservation check compared those files with their accepted MVP-01C manifest hashes and passed. No UI file was edited in this correction.

These are inspected local pure/injected/static/compiler checks. No actual RPC, PostgreSQL/SQL, Auth/provider/browser, network, credentials, Docker/services/ports, installation, Git mutation, provisioning, cleanup, destruction, activation, deployment or StoreFlow access occurred.

## Evidence limits and next gate

The correction establishes source-level parity with the inspected M-16 constraint and deterministic validator behavior. It does not verify deployed RPC compatibility, PostgreSQL serialization, effective ACL/RLS, real membership revocation, Auth/browser timing or production data.

Stop for independent review of this report and `MVP01C_VALIDATOR_CORRECTION_PF-SUP-2026-10-27-05.sha256`. No dependent or protected work is authorized by this package.
