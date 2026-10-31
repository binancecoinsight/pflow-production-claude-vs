import { readFileSync } from 'node:fs';

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const read = (path) => readFileSync(path, 'utf8');

const migration = read('supabase/migrations/20261011000016_m16_staff_management_rpcs.sql');
const policy = read('src/lib/auth/staffInvitationOversight.ts');
const panel = read('src/components/StaffInvitationOversightPanel.tsx');
const shell = read('src/components/AuthenticatedShell.tsx');
const form = read('src/components/StaffInvitationForm.tsx');

const rpcStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.rpc_list_staff_invitations(');
const rpcEnd = migration.indexOf('-- ----------------------------------------------------------------------------', rpcStart);
const rpc = migration.slice(rpcStart, rpcEnd);
assert(rpcStart >= 0, 'reviewed M-16 list RPC exists');
assert(/p_pharmacy_id UUID/.test(rpc), 'M-16 list RPC accepts only the pharmacy identifier');
for (const field of ['id UUID', 'pharmacy_id UUID', 'branch_id UUID', 'email TEXT', 'role VARCHAR(32)', 'invited_by UUID', 'status VARCHAR(16)', 'expires_at TIMESTAMPTZ', 'accepted_at TIMESTAMPTZ', 'created_at TIMESTAMPTZ']) {
  assert(rpc.includes(field), `M-16 response includes ${field}`);
}
assert(!/token_hash|raw_token|accepted_by|updated_at/.test(rpc.slice(rpc.indexOf('RETURNS TABLE'), rpc.indexOf('LANGUAGE'))), 'M-16 return table excludes secret and non-allowlisted fields');
assert(rpc.includes("v_caller_role NOT IN ('OWNER', 'MANAGER')"), 'M-16 authorizes only active OWNER or MANAGER callers');

assert(policy.includes("['MANAGER', 'PHARMACIST', 'CASHIER']"), 'validator accepts exactly invitation roles and excludes OWNER');
assert(policy.includes("['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']"), 'validator accepts all four M-16 statuses');
assert(policy.includes('keys.length === FIELD_NAMES.length'), 'validator rejects missing or extra fields');
assert(policy.includes('ids.has(parsed.id)'), 'validator rejects duplicate invitation IDs');
assert(policy.includes('row.pharmacy_id !== pharmacyId'), 'validator rejects cross-pharmacy rows');
assert(policy.includes('Object.freeze(records)'), 'published allowlist is immutable');
assert(policy.includes("input.role !== 'OWNER' && input.role !== 'MANAGER'"), 'local eligibility is limited to OWNER and MANAGER');
assert(policy.includes('sameStaffInvitationWorkspace(binding, currentBinding())'), 'load and publication recheck the complete workspace binding');
assert(policy.includes("executor({ p_pharmacy_id: binding.pharmacyId })"), 'executor receives only the coherent workspace pharmacy identifier');
assert(!policy.includes('localStorage') && !panel.includes('localStorage'), 'oversight adds no storage behavior');

assert(panel.includes("supabase.rpc('rpc_list_staff_invitations', arguments_)"), 'runtime path invokes only the reviewed list RPC');
assert(panel.includes('new StaffInvitationOversightCoordinator()'), 'panel uses production freshness/publication coordinator');
assert(panel.includes('publication.bindingKey === bindingKey'), 'rendered results are bound to the current workspace key');
assert(panel.indexOf('coordinatorRef.current.invalidate();') < panel.indexOf('setReload((value) => value + 1)'), 'manual refresh invalidates before starting the replacement load');
assert(panel.includes("view.kind === 'loading'") && panel.includes("view.kind === 'empty'") && panel.includes("view.kind === 'error'") && panel.includes("view.kind === 'success'"), 'panel has four distinct view states');
assert(panel.includes('Server status') && panel.includes('Time-derived: past expiry'), 'UI preserves server status and labels the clock-derived indicator');
assert(!/token_hash|raw_token|accepted_by/.test(panel), 'panel cannot render secret or excluded response fields');
assert(shell.includes('{canViewStaffInvitationOversight && <StaffInvitationOversightPanel />}'), 'shell exposes the panel only after coherent local eligibility');
assert(shell.includes("canViewWorkspaceTab('reports', role, permissions)"), 'existing navigation entitlement matrix remains wired');
assert(form.includes('acceptStaffInvitation(invitationId, rawToken)'), 'existing invitation acceptance form remains present and separate');
assert(!form.includes('rpc_list_staff_invitations'), 'existing mutation/acceptance form was not repurposed for oversight');

console.log(`Staff invitation oversight wiring tests: ${passed} passed`);
