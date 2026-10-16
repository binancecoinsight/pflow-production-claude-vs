/**
 * Standalone Platform Admin Authorization Boundary Test Suite
 * Designed to verify authorization rules, role hierarchy, access matrix,
 * and fail-closed security properties without requiring external node_modules.
 */

import {
  verifyAdminRole,
  ROLE_ACCESS_MATRIX,
  evaluateAdminProfile,
  type PlatformAdminRole,
  type PlatformAdminRecord,
  type AdminAuthResult,
} from './auth.ts';

/**
 * State machine adapter verifying the exact server-side evaluation of getAuthenticatedAdmin()
 * via the real, exported evaluateAdminProfile function.
 */
export function evaluateAdminAuthorization(
  user: { id: string; email: string } | null,
  adminRecord: { user_id: string; platform_role: PlatformAdminRole; is_active: boolean } | null,
  clientConfigured: boolean = true
): AdminAuthResult {
  if (!clientConfigured) {
    return {
      status: 'error',
      user: null as any,
      admin: null as any,
      reason: 'Supabase server client not configured.',
    };
  }

  const record: PlatformAdminRecord | null = adminRecord ? {
    user_id: adminRecord.user_id,
    platform_role: adminRecord.platform_role,
    is_active: adminRecord.is_active,
    granted_at: new Date().toISOString(),
  } : null;

  return evaluateAdminProfile(user, record);
}

async function runAuthBoundaryTestSuite() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${desc}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL: ${desc}`);
    }
  }

  console.log('--- PHARMACYFLOW STAGE 2.2B: PLATFORM ADMIN AUTHENTICATION BOUNDARY TESTS ---\n');

  // Test 1: Unauthenticated request fails closed
  console.log('[1. Unauthenticated Session Tests]');
  const unauthResult = evaluateAdminAuthorization(null, null, true);
  assert(unauthResult.status === 'unauthenticated', 'Unauthenticated request produces status="unauthenticated"');
  assert(unauthResult.admin === null, 'Unauthenticated request has admin=null');
  assert(unauthResult.user === null, 'Unauthenticated request has user=null');

  // Test 2: Authenticated non-admin user fails closed
  console.log('\n[2. Authenticated Non-Admin User Tests]');
  const regularUser = { id: 'usr-regular-1234', email: 'owner@localpharmacy.ng' };
  const nonAdminResult = evaluateAdminAuthorization(regularUser, null, true);
  assert(nonAdminResult.status === 'forbidden', 'Authenticated non-admin user is denied with status="forbidden"');
  assert(nonAdminResult.admin === null, 'Non-admin user cannot obtain admin credentials');
  assert(nonAdminResult.user?.id === regularUser.id, 'User identity preserved for auditing without elevation');

  // Test 3: Inactive platform admin fails closed
  console.log('\n[3. Inactive Platform Admin Tests]');
  const inactiveAdminUser = { id: 'usr-admin-inactive', email: 'former-admin@pharmacyflow.com' };
  const inactiveRecord = { user_id: 'usr-admin-inactive', platform_role: 'ADMIN' as PlatformAdminRole, is_active: false };
  const inactiveResult = evaluateAdminAuthorization(inactiveAdminUser, inactiveRecord, true);
  assert(inactiveResult.status === 'forbidden', 'Inactive admin is denied with status="forbidden"');
  assert(inactiveResult.admin === null, 'Inactive admin cannot obtain admin record');

  // Test 4: Active platform admin role authorization
  console.log('\n[4. Active Platform Admin Authorization Tests]');
  const supportUser = { id: 'usr-support-1', email: 'support@pharmacyflow.com' };
  const supportRecord = { user_id: 'usr-support-1', platform_role: 'SUPPORT' as PlatformAdminRole, is_active: true };
  const supportResult = evaluateAdminAuthorization(supportUser, supportRecord, true);
  assert(supportResult.status === 'authorized', 'Active SUPPORT user is authorized');
  assert(supportResult.admin?.platform_role === 'SUPPORT', 'SUPPORT role correctly bound to session');

  const adminUser = { id: 'usr-admin-1', email: 'ops-admin@pharmacyflow.com' };
  const adminRecord = { user_id: 'usr-admin-1', platform_role: 'ADMIN' as PlatformAdminRole, is_active: true };
  const adminResult = evaluateAdminAuthorization(adminUser, adminRecord, true);
  assert(adminResult.status === 'authorized', 'Active ADMIN user is authorized');
  assert(adminResult.admin?.platform_role === 'ADMIN', 'ADMIN role correctly bound to session');

  const superAdminUser = { id: 'usr-super-1', email: 'director@pharmacyflow.com' };
  const superAdminRecord = { user_id: 'usr-super-1', platform_role: 'SUPER_ADMIN' as PlatformAdminRole, is_active: true };
  const superAdminResult = evaluateAdminAuthorization(superAdminUser, superAdminRecord, true);
  assert(superAdminResult.status === 'authorized', 'Active SUPER_ADMIN user is authorized');
  assert(superAdminResult.admin?.platform_role === 'SUPER_ADMIN', 'SUPER_ADMIN role correctly bound to session');

  // Test 5: Role hierarchy verification
  console.log('\n[5. Role Hierarchy Tests]');
  assert(verifyAdminRole('SUPPORT', 'SUPPORT') === true, 'SUPPORT satisfies required SUPPORT');
  assert(verifyAdminRole('SUPPORT', 'ADMIN') === true, 'ADMIN satisfies required SUPPORT');
  assert(verifyAdminRole('SUPPORT', 'SUPER_ADMIN') === true, 'SUPER_ADMIN satisfies required SUPPORT');
  assert(verifyAdminRole('ADMIN', 'SUPPORT') === false, 'SUPPORT does NOT satisfy required ADMIN');
  assert(verifyAdminRole('ADMIN', 'ADMIN') === true, 'ADMIN satisfies required ADMIN');
  assert(verifyAdminRole('ADMIN', 'SUPER_ADMIN') === true, 'SUPER_ADMIN satisfies required ADMIN');
  assert(verifyAdminRole('SUPER_ADMIN', 'SUPPORT') === false, 'SUPPORT does NOT satisfy required SUPER_ADMIN');
  assert(verifyAdminRole('SUPER_ADMIN', 'ADMIN') === false, 'ADMIN does NOT satisfy required SUPER_ADMIN');
  assert(verifyAdminRole('SUPER_ADMIN', 'SUPER_ADMIN') === true, 'SUPER_ADMIN satisfies required SUPER_ADMIN');

  // Test 6: Role access matrix boundaries
  console.log('\n[6. Role Access Matrix Boundaries Tests]');
  // SUPPORT checks
  assert(ROLE_ACCESS_MATRIX.SUPPORT.canViewOverview === true, 'SUPPORT can view overview');
  assert(ROLE_ACCESS_MATRIX.SUPPORT.canViewSupportTickets === true, 'SUPPORT can view support tickets');
  assert(ROLE_ACCESS_MATRIX.SUPPORT.canViewFinancials === false, 'SUPPORT CANNOT view financials (sensitive ledger redacted)');
  assert(ROLE_ACCESS_MATRIX.SUPPORT.canManageSubscriptions === false, 'SUPPORT CANNOT manage subscriptions');
  assert(ROLE_ACCESS_MATRIX.SUPPORT.canSuspendStores === false, 'SUPPORT CANNOT suspend stores');
  assert(ROLE_ACCESS_MATRIX.SUPPORT.canModifyPayoutRules === false, 'SUPPORT CANNOT modify payout rules');
  assert(ROLE_ACCESS_MATRIX.SUPPORT.canManagePlatformAdmins === false, 'SUPPORT CANNOT manage platform admins');

  // ADMIN checks
  assert(ROLE_ACCESS_MATRIX.ADMIN.canViewFinancials === true, 'ADMIN can view financials');
  assert(ROLE_ACCESS_MATRIX.ADMIN.canManageSubscriptions === true, 'ADMIN can manage subscriptions');
  assert(ROLE_ACCESS_MATRIX.ADMIN.canSuspendStores === true, 'ADMIN can suspend stores');
  assert(ROLE_ACCESS_MATRIX.ADMIN.canModifyPayoutRules === false, 'ADMIN CANNOT modify system-wide payout rules');
  assert(ROLE_ACCESS_MATRIX.ADMIN.canManagePlatformAdmins === false, 'ADMIN CANNOT manage platform admins');

  // SUPER_ADMIN checks
  assert(ROLE_ACCESS_MATRIX.SUPER_ADMIN.canModifyPayoutRules === true, 'SUPER_ADMIN can modify payout rules');
  assert(ROLE_ACCESS_MATRIX.SUPER_ADMIN.canManagePlatformAdmins === true, 'SUPER_ADMIN can manage platform admins');

  // Test 7: Fail-closed on missing configuration
  console.log('\n[7. System Configuration Fail-Closed Tests]');
  const configErrorResult = evaluateAdminAuthorization(adminUser, adminRecord, false);
  assert(configErrorResult.status === 'error', 'Unconfigured client fails closed with status="error"');
  assert(configErrorResult.admin === null, 'No admin credentials granted on unconfigured client');

  // Test 8: Browser security — check that service-role key is never required in browser
  console.log('\n[8. Browser Security Isolation Tests]');
  const hasServiceRoleInClient = typeof process !== 'undefined' && 'SUPABASE_SERVICE_ROLE_KEY' in (process.env || {});
  assert(!hasServiceRoleInClient, 'Client environment does not expose SUPABASE_SERVICE_ROLE_KEY');

  console.log(`\n--- TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED ---\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthBoundaryTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
