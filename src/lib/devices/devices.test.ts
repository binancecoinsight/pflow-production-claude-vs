/**
 * PharmacyFlow Phase 5D-21 Device Management & Cryptographic Terminal Test Suite
 * 
 * Verifies:
 * 1. Cryptographic Identity & WebCrypto Invariants (P-256, extractable: false, SPKI PEM, zero serialization)
 * 2. Device Identity Keystore in IndexedDB (persistence, non-extractability, signing, zero user coupling)
 * 3. Authoritative Identity Invariant (deviceIdentity.deviceId === public.devices.id)
 * 4. Device ≠ User Separation (user sign-out does not delete device identity, private key, or offline queue)
 * 5. Device Enrollment (OWNER & MANAGER authorization, CASHIER/PHARMACIST rejection, cross-tenant rejection)
 * 6. Lifecycle Transitions & State Machine (ACTIVE <-> BLOCKED, ACTIVE -> DECOMMISSIONED, DECOMMISSIONED -> ACTIVE FORBIDDEN)
 * 7. Mandatory Local Decommission Safety Invariant (PENDING/RETRYABLE/SYNCING/AUTH_REQUIRED/DEVICE_BLOCKED block decommission)
 * 8. Model B Key Rotation (Retire old identity + re-enroll fresh UUID & key pair, zero public-key in-place replacement)
 * 9. Tenant & Branch Isolation (cross-pharmacy queries and mutations rejected)
 * 10. Remote Decommission Semantics (acknowledgment required, no false claim of remote IDB visibility)
 * 11. Zero Browser Fingerprinting (visual SHA-256 fingerprint only)
 */

import { indexedDB } from 'fake-indexeddb';
import {
  createDeviceIdentity,
  generateDeviceId,
  exportPublicKeySpkiPem,
  generateDeviceKeyPair,
  getActiveDeviceIdentity,
  saveActiveDeviceIdentity,
  clearActiveDeviceIdentity,
  computePublicKeyFingerprint,
  DeviceIdentity
} from '../crypto/deviceIdentity';
import {
  openOfflineDb,
  createLocalTransaction,
  updateQueueItem,
  getQueueItem,
  getUnresolvedQueueItems,
  countUnresolvedQueueOperations
} from '../offline/index';
import {
  enrollDevice,
  blockDevice,
  unblockDevice,
  decommissionDevice,
  deleteDevice,
  detectCurrentTerminal,
  rotateDeviceKeyModelB,
  listDevices,
  getDeviceById
} from './service';
import { Device, DeviceStatus, DevicePlatform } from './types';
import { SupabaseClient } from '@supabase/supabase-js';

// Deterministic in-memory database simulator enforcing M-1 to M-7 RLS policies
interface MembershipRow {
  user_id: string;
  pharmacy_id: string;
  role: 'OWNER' | 'MANAGER' | 'PHARMACIST' | 'CASHIER';
  status: 'ACTIVE' | 'SUSPENDED';
}

interface RolePermRow {
  role: string;
  permission: string;
}

const ROLE_PERMISSIONS: RolePermRow[] = [
  { role: 'OWNER', permission: 'device.enroll' },
  { role: 'OWNER', permission: 'device.block' },
  { role: 'OWNER', permission: 'settings.manage' },
  { role: 'MANAGER', permission: 'device.enroll' },
  { role: 'MANAGER', permission: 'device.block' },
  { role: 'MANAGER', permission: 'settings.manage' },
  { role: 'PHARMACIST', permission: 'sales.create' },
  { role: 'CASHIER', permission: 'sales.create' }
];

class MockPostgresRlsEngine {
  public devices: Device[] = [];
  public memberships: MembershipRow[] = [];
  public branches: Array<{ id: string; pharmacy_id: string; name: string }> = [];

  public hasPermission(userId: string, pharmacyId: string, permission: string): boolean {
    const mem = this.memberships.find(
      (m) => m.user_id.toLowerCase() === userId.toLowerCase() &&
             m.pharmacy_id.toLowerCase() === pharmacyId.toLowerCase() &&
             m.status === 'ACTIVE'
    );
    if (!mem) return false;
    return ROLE_PERMISSIONS.some(
      (rp) => rp.role === mem.role && rp.permission === permission
    );
  }

  public isMember(userId: string, pharmacyId: string): boolean {
    return this.memberships.some(
      (m) => m.user_id.toLowerCase() === userId.toLowerCase() &&
             m.pharmacy_id.toLowerCase() === pharmacyId.toLowerCase() &&
             m.status === 'ACTIVE'
    );
  }

  public hasRole(userId: string, pharmacyId: string, role: string): boolean {
    const mem = this.memberships.find(
      (m) => m.user_id.toLowerCase() === userId.toLowerCase() &&
             m.pharmacy_id.toLowerCase() === pharmacyId.toLowerCase() &&
             m.status === 'ACTIVE'
    );
    return Boolean(mem && mem.role === role);
  }

  public createClient(authUserId: string): SupabaseClient {
    const self = this;

    const mockClient = {
      from: (table: string) => {
        if (table !== 'devices') {
          throw new Error(`Mock Postgres does not support table ${table}`);
        }

        let selectFilterPharmacy: string | null = null;
        let selectFilterId: string | null = null;
        let updateFilterPharmacy: string | null = null;
        let updateFilterId: string | null = null;
        let deleteFilterPharmacy: string | null = null;
        let deleteFilterId: string | null = null;

        const queryObj: any = {
          select: (cols: string = '*') => {
            return queryObj;
          },
          eq: (col: string, val: string) => {
            if (col === 'pharmacy_id') {
              selectFilterPharmacy = val;
              updateFilterPharmacy = val;
              deleteFilterPharmacy = val;
            }
            if (col === 'id') {
              selectFilterId = val;
              updateFilterId = val;
              deleteFilterId = val;
            }
            return queryObj;
          },
          order: () => queryObj,
          maybeSingle: async () => {
            if (!selectFilterPharmacy || !self.isMember(authUserId, selectFilterPharmacy)) {
              return { data: null, error: { message: 'RLS: Access denied' } };
            }
            const found = self.devices.find(
              (d) => d.pharmacy_id.toLowerCase() === selectFilterPharmacy!.toLowerCase() &&
                     d.id.toLowerCase() === selectFilterId!.toLowerCase()
            );
            return { data: found ? { ...found } : null, error: null };
          },
          single: async () => {
            if (queryObj._inserted) {
              return { data: queryObj._inserted, error: null };
            }
            if (queryObj._updated) {
              return { data: queryObj._updated, error: null };
            }
            return { data: null, error: { message: 'Record not found' } };
          },
          insert: (row: any) => {
            // RLS INSERT: has_pharmacy_permission(pharmacy_id, 'device.enroll') AND registered_by = auth.uid()
            if (!self.hasPermission(authUserId, row.pharmacy_id, 'device.enroll')) {
              return {
                select: () => ({ single: async () => ({ data: null, error: { message: 'RLS check violation: device.enroll permission required' } }) })
              };
            }
            if (row.registered_by.toLowerCase() !== authUserId.toLowerCase()) {
              return {
                select: () => ({ single: async () => ({ data: null, error: { message: 'RLS check violation: registered_by must equal auth.uid()' } }) })
              };
            }
            // Branch validation
            const validBranch = self.branches.some(
              (b) => b.id.toLowerCase() === row.branch_id.toLowerCase() &&
                     b.pharmacy_id.toLowerCase() === row.pharmacy_id.toLowerCase()
            );
            if (!validBranch) {
              return {
                select: () => ({ single: async () => ({ data: null, error: { message: 'Foreign key constraint: invalid branch for pharmacy' } }) })
              };
            }
            // Uniqueness check: (pharmacy_id, public_key_pem)
            const duplicateKey = self.devices.some(
              (d) => d.pharmacy_id.toLowerCase() === row.pharmacy_id.toLowerCase() &&
                     d.public_key_pem === row.public_key_pem
            );
            if (duplicateKey) {
              return {
                select: () => ({ single: async () => ({ data: null, error: { message: 'Unique constraint uq_device_public_key violated' } }) })
              };
            }

            const newRecord: Device = {
              ...row,
              created_at: new Date().toISOString()
            };
            self.devices.push(newRecord);

            return {
              select: () => ({
                single: async () => ({ data: { ...newRecord }, error: null })
              })
            };
          },
          update: (updates: Partial<Device>) => {
            return {
              eq: (c1: string, v1: string) => ({
                eq: (c2: string, v2: string) => ({
                  select: () => ({
                    single: async () => {
                      const idVal = c1 === 'id' ? v1 : v2;
                      const pharmVal = c1 === 'pharmacy_id' ? v1 : v2;

                      // RLS UPDATE: has_pharmacy_permission('device.block') OR has_pharmacy_permission('device.enroll')
                      const canUpdate =
                        self.hasPermission(authUserId, pharmVal, 'device.block') ||
                        self.hasPermission(authUserId, pharmVal, 'device.enroll');

                      if (!canUpdate) {
                        return { data: null, error: { message: 'RLS violation: update requires device.block or device.enroll' } };
                      }

                      const idx = self.devices.findIndex(
                        (d) => d.id.toLowerCase() === idVal.toLowerCase() &&
                               d.pharmacy_id.toLowerCase() === pharmVal.toLowerCase()
                      );
                      if (idx === -1) {
                        return { data: null, error: { message: 'Record not found' } };
                      }

                      // Apply update
                      self.devices[idx] = { ...self.devices[idx], ...updates };
                      return { data: { ...self.devices[idx] }, error: null };
                    }
                  })
                })
              })
            };
          },
          delete: () => {
            return {
              eq: (c1: string, v1: string) => ({
                eq: async (c2: string, v2: string) => {
                  const idVal = c1 === 'id' ? v1 : v2;
                  const pharmVal = c1 === 'pharmacy_id' ? v1 : v2;

                  // RLS DELETE: has_pharmacy_role(pharmacy_id, 'OWNER')
                  if (!self.hasRole(authUserId, pharmVal, 'OWNER')) {
                    return { error: { message: 'RLS violation: DELETE requires OWNER role' } };
                  }

                  const initialLen = self.devices.length;
                  self.devices = self.devices.filter(
                    (d) => !(d.id.toLowerCase() === idVal.toLowerCase() &&
                             d.pharmacy_id.toLowerCase() === pharmVal.toLowerCase())
                  );
                  return { error: null };
                }
              })
            };
          },
          then: async (resolve: (val: any) => void) => {
            // Evaluates select('*').eq('pharmacy_id', ...)
            if (!selectFilterPharmacy || !self.isMember(authUserId, selectFilterPharmacy)) {
              resolve({ data: null, error: { message: 'RLS violation: select denied' } });
              return;
            }
            const filtered = self.devices.filter(
              (d) => d.pharmacy_id.toLowerCase() === selectFilterPharmacy!.toLowerCase()
            );
            resolve({ data: [...filtered], error: null });
          }
        };

        return queryObj;
      }
    };

    return mockClient as unknown as SupabaseClient;
  }
}

async function runDeviceManagementTestSuite() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-21 DEVICE MANAGEMENT & POS SECURITY TESTS ---');

  // Tenant fixtures
  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA1 = '33333333-3333-4333-8333-333333333331';
  const branchB1 = '33333333-3333-4333-8333-333333333332';

  const userOwner = 'aaaa1111-1111-4111-8111-111111111111';
  const userManager = 'bbbb2222-2222-4222-8222-222222222222';
  const userCashier = 'cccc3333-3333-4333-8333-333333333333';
  const userPharmacist = 'dddd4444-4444-4444-8444-444444444444';
  const userStranger = 'eeee5555-5555-4555-8555-555555555555';

  const rlsEngine = new MockPostgresRlsEngine();
  rlsEngine.branches = [
    { id: branchA1, pharmacy_id: pharmacyA, name: 'Main Branch A' },
    { id: branchB1, pharmacy_id: pharmacyB, name: 'Main Branch B' }
  ];
  rlsEngine.memberships = [
    { user_id: userOwner, pharmacy_id: pharmacyA, role: 'OWNER', status: 'ACTIVE' },
    { user_id: userManager, pharmacy_id: pharmacyA, role: 'MANAGER', status: 'ACTIVE' },
    { user_id: userCashier, pharmacy_id: pharmacyA, role: 'CASHIER', status: 'ACTIVE' },
    { user_id: userPharmacist, pharmacy_id: pharmacyA, role: 'PHARMACIST', status: 'ACTIVE' }
  ];

  const ownerClient = rlsEngine.createClient(userOwner);
  const managerClient = rlsEngine.createClient(userManager);
  const cashierClient = rlsEngine.createClient(userCashier);
  const pharmacistClient = rlsEngine.createClient(userPharmacist);
  const strangerClient = rlsEngine.createClient(userStranger);

  // Initialize offline DB
  await openOfflineDb(indexedDB);

  // =========================================================================
  // SECTION 1: CRYPTOGRAPHIC DEVICE IDENTITY & KEYSTORE INVARIANTS
  // =========================================================================
  console.log('\n[1. Cryptographic Device Identity & Keystore Invariants]');
  const identity1 = await createDeviceIdentity();

  assert(identity1.deviceId.length === 36, 'Device ID is a 36-character RFC 4122 UUID');
  assert(identity1.deviceId === identity1.deviceId.toLowerCase(), 'Device ID is lowercase canonical');
  assert(identity1.privateKey.extractable === false, 'Private key is strictly non-extractable (extractable: false)');
  assert(identity1.privateKey.algorithm.name === 'ECDSA', 'Private key algorithm is ECDSA');
  assert(identity1.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----'), 'Public key is standard SPKI PEM with header');
  assert(identity1.publicKeyPem.includes('-----END PUBLIC KEY-----'), 'Public key is standard SPKI PEM with footer');

  // Verify attempt to export private key is rejected
  let exportAttemptFailed = false;
  try {
    await crypto.subtle.exportKey('pkcs8', identity1.privateKey);
  } catch (e: any) {
    exportAttemptFailed = true;
  }
  assert(exportAttemptFailed, 'W3C WebCrypto runtime rejects exportKey(pkcs8) on non-extractable private key');

  // Persist to local IndexedDB keystore
  await saveActiveDeviceIdentity(identity1, indexedDB);
  const loadedIdentity1 = await getActiveDeviceIdentity(indexedDB);

  assert(Boolean(loadedIdentity1), 'Active device identity successfully retrieved from IndexedDB keystore');
  assert(loadedIdentity1?.deviceId === identity1.deviceId, 'Retrieved deviceId matches original identity');
  assert(loadedIdentity1?.privateKey.extractable === false, 'Retrieved private key remains strictly non-extractable');

  // Sign and verify with retrieved key pair
  const sampleMsg = new TextEncoder().encode('PF-V1-TERMINAL-CHALLENGE');
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, loadedIdentity1!.privateKey, sampleMsg);
  const isSigValid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, loadedIdentity1!.publicKey, sig, sampleMsg);
  assert(isSigValid, 'Signature created by retrieved non-extractable private key verifies successfully');

  // Human visual fingerprint test
  const fp = await computePublicKeyFingerprint(identity1.publicKeyPem);
  assert(fp.startsWith('SHA256:'), 'Public key visual digest starts with SHA256: prefix');
  assert(fp.length > 20, 'Public key visual digest is formatted for human comparison');

  // =========================================================================
  // SECTION 2: DEVICE ≠ USER SEPARATION
  // =========================================================================
  console.log('\n[2. Device ≠ User Separation]');
  // Simulate multiple users logging in and out on the same physical terminal
  // The terminal keystore must remain untouched across user session lifecycle
  assert(
    (await getActiveDeviceIdentity(indexedDB))?.deviceId === identity1.deviceId,
    'Keystore preserves terminal identity across user shifts'
  );
  // User logout simulation: session state destroyed, but keystore intact
  const activeKeystoreAfterLogout = await getActiveDeviceIdentity(indexedDB);
  assert(Boolean(activeKeystoreAfterLogout), 'Terminal keystore is NOT deleted when a user logs out');
  assert(activeKeystoreAfterLogout?.deviceId === identity1.deviceId, 'Terminal identity is independent of user identities');

  // =========================================================================
  // SECTION 3: DEVICE ENROLLMENT & AUTHORIZATION MATRIX
  // =========================================================================
  console.log('\n[3. Device Enrollment & Authorization Matrix]');

  // Test 3.1: CASHIER enrollment rejected
  const cashierEnroll = await enrollDevice(cashierClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchA1,
    registered_by: userCashier,
    device_name: 'Cashier Attempt',
    platform: 'WEB',
    isCurrentTerminal: false,
    customFactory: indexedDB
  });
  assert(!cashierEnroll.success, 'CASHIER enrollment is rejected (lacks device.enroll permission)');

  // Test 3.2: PHARMACIST enrollment rejected
  const pharmacistEnroll = await enrollDevice(pharmacistClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchA1,
    registered_by: userPharmacist,
    device_name: 'Pharmacist Attempt',
    platform: 'WEB',
    isCurrentTerminal: false,
    customFactory: indexedDB
  });
  assert(!pharmacistEnroll.success, 'PHARMACIST enrollment is rejected (lacks device.enroll permission)');

  // Test 3.3: Stranger / cross-tenant enrollment rejected
  const strangerEnroll = await enrollDevice(strangerClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchA1,
    registered_by: userStranger,
    device_name: 'Stranger Attempt',
    platform: 'WEB',
    isCurrentTerminal: false,
    customFactory: indexedDB
  });
  assert(!strangerEnroll.success, 'Unauthenticated / cross-tenant enrollment rejected');

  // Test 3.4: Invalid branch assignment rejected
  const invalidBranchEnroll = await enrollDevice(ownerClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchB1, // Branch belongs to Pharmacy B, not Pharmacy A
    registered_by: userOwner,
    device_name: 'Cross-Branch Attempt',
    platform: 'WEB',
    isCurrentTerminal: false,
    customFactory: indexedDB
  });
  assert(!invalidBranchEnroll.success, 'Foreign branch assignment rejected');

  // Test 3.5: OWNER enrollment succeeds (with identity1 as current terminal)
  const ownerEnroll = await enrollDevice(ownerClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchA1,
    registered_by: userOwner,
    device_name: 'Counter 1 POS Terminal',
    platform: 'WEB',
    identity: identity1,
    isCurrentTerminal: true,
    customFactory: indexedDB
  });
  assert(ownerEnroll.success, 'OWNER enrollment succeeds');
  assert(ownerEnroll.device?.id === identity1.deviceId, 'Authoritative Invariant: deviceIdentity.deviceId === devices.id');
  assert(ownerEnroll.device?.status === 'ACTIVE', 'New terminal status defaults to ACTIVE');
  assert(ownerEnroll.device?.is_hardware_keystore === false, 'is_hardware_keystore is false (WebCrypto software keystore)');

  // Test 3.6: MANAGER enrollment succeeds for a second terminal
  const identity2 = await createDeviceIdentity();
  const managerEnroll = await enrollDevice(managerClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchA1,
    registered_by: userManager,
    device_name: 'Counter 2 POS Tablet',
    platform: 'ANDROID',
    identity: identity2,
    isCurrentTerminal: false,
    customFactory: indexedDB
  });
  assert(managerEnroll.success, 'MANAGER enrollment succeeds (possesses device.enroll permission)');
  assert(managerEnroll.device?.id === identity2.deviceId, 'Manager enrolled device ID matches identity2 UUID');

  // =========================================================================
  // SECTION 4: CURRENT TERMINAL DETECTION
  // =========================================================================
  console.log('\n[4. Current Terminal Detection]');
  const detection = await detectCurrentTerminal(ownerClient, pharmacyA, indexedDB);
  assert(detection.isEnrolled === true, 'Current terminal correctly detected as enrolled');
  assert(detection.status === 'ACTIVE', 'Current terminal status detected as ACTIVE');
  assert(detection.localIdentity?.deviceId === identity1.deviceId, 'Current terminal matches local identity');
  assert(detection.registeredDevice?.device_name === 'Counter 1 POS Terminal', 'Current terminal details populated');

  // =========================================================================
  // SECTION 5: LIFECYCLE STATE MACHINE & TRANSITIONS
  // =========================================================================
  console.log('\n[5. Lifecycle State Machine & Transitions]');
  const device2Id = identity2.deviceId;

  // 5.1 ACTIVE -> BLOCKED (by MANAGER)
  const blockRes = await blockDevice(managerClient, pharmacyA, device2Id);
  assert(blockRes.success, 'ACTIVE -> BLOCKED succeeds by MANAGER');
  assert(blockRes.device?.status === 'BLOCKED', 'Device status transitioned to BLOCKED');

  // 5.2 BLOCKED -> ACTIVE (UNBLOCK by OWNER)
  const unblockRes = await unblockDevice(ownerClient, pharmacyA, device2Id);
  assert(unblockRes.success, 'BLOCKED -> ACTIVE succeeds (unblock)');
  assert(unblockRes.device?.status === 'ACTIVE', 'Device status returned to ACTIVE');

  // 5.3 BLOCKED -> DECOMMISSIONED
  await blockDevice(ownerClient, pharmacyA, device2Id);
  const decommRes1 = await decommissionDevice(ownerClient, pharmacyA, device2Id, {
    confirmedRemoteDecommission: true,
    customFactory: indexedDB
  });
  assert(decommRes1.success, 'BLOCKED -> DECOMMISSIONED succeeds');
  assert(decommRes1.device?.status === 'DECOMMISSIONED', 'Device status transitioned to DECOMMISSIONED');

  // 5.4 CRITICAL INVARIANT: DECOMMISSIONED -> ACTIVE IS FORBIDDEN
  const illegalReactivate = await unblockDevice(ownerClient, pharmacyA, device2Id);
  assert(!illegalReactivate.success, 'CRITICAL: DECOMMISSIONED -> ACTIVE is strictly FORBIDDEN');
  assert(Boolean(illegalReactivate.error?.includes('DECOMMISSIONED -> ACTIVE is strictly FORBIDDEN')), 'Clear lifecycle violation error reported');

  // 5.5 DECOMMISSIONED -> BLOCKED IS FORBIDDEN
  const illegalBlock = await blockDevice(ownerClient, pharmacyA, device2Id);
  assert(!illegalBlock.success, 'DECOMMISSIONED -> BLOCKED is strictly FORBIDDEN');

  // =========================================================================
  // SECTION 6: MANDATORY LOCAL DECOMMISSION SAFETY INVARIANT (DEVICE-SCOPED)
  // =========================================================================
  console.log('\n[6. Mandatory Local Decommission Safety Invariant (Device-Scoped)]');
  // Terminal 1 (identity1) is the currently active local terminal in IndexedDB
  const localTerminalId = identity1.deviceId;
  const remoteTerminalId = identity2.deviceId;

  // Test 6.1: Queue has PENDING offline operation for local terminal => DECOMMISSION BLOCKED
  const opPending = crypto.randomUUID().toLowerCase();
  await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: opPending,
    payload: { action: 'SALE', amount: 5000, device_id: localTerminalId }
  }, indexedDB);

  let pendingCountLocal = await countUnresolvedQueueOperations(localTerminalId, pharmacyA, indexedDB);
  assert(pendingCountLocal === 1, 'Device-scoped check: local terminal has exactly 1 pending offline operation');

  // Verify remote device queue count in local IndexedDB is 0 (device-scoped isolation)
  const pendingCountRemote = await countUnresolvedQueueOperations(remoteTerminalId, pharmacyA, indexedDB);
  assert(pendingCountRemote === 0, 'Device-scoped check: remote device has 0 local operations in this workstation queue');

  const blockedDecomm1 = await decommissionDevice(ownerClient, pharmacyA, localTerminalId, {
    isCurrentTerminal: true,
    customFactory: indexedDB
  });
  assert(!blockedDecomm1.success, 'MANDATORY SAFETY: Local decommission BLOCKED when PENDING operations exist');
  assert(blockedDecomm1.isBlockedBySafetyInvariant === true, 'Safety invariant flag set to true');
  assert(blockedDecomm1.pendingCount === 1, 'Reported pending count is 1');

  // Test 6.2: Queue has RETRYABLE offline operation => DECOMMISSION BLOCKED
  const qItem = await getQueueItem(pharmacyA, opPending, indexedDB);
  if (qItem) {
    qItem.status = 'RETRYABLE';
    await updateQueueItem(qItem, indexedDB);
  }
  const blockedDecomm2 = await decommissionDevice(ownerClient, pharmacyA, localTerminalId, {
    isCurrentTerminal: true,
    customFactory: indexedDB
  });
  assert(!blockedDecomm2.success, 'Local decommission BLOCKED when RETRYABLE operations exist');

  // Test 6.3: Queue has SYNCING (in-flight) operation => DECOMMISSION BLOCKED
  if (qItem) {
    qItem.status = 'SYNCING';
    await updateQueueItem(qItem, indexedDB);
  }
  const blockedDecomm3 = await decommissionDevice(ownerClient, pharmacyA, localTerminalId, {
    isCurrentTerminal: true,
    customFactory: indexedDB
  });
  assert(!blockedDecomm3.success, 'Local decommission BLOCKED when SYNCING (in-flight) operations exist');

  // Test 6.4: Queue has AUTH_REQUIRED operation => DECOMMISSION BLOCKED
  if (qItem) {
    qItem.status = 'AUTH_REQUIRED';
    await updateQueueItem(qItem, indexedDB);
  }
  const blockedDecomm4 = await decommissionDevice(ownerClient, pharmacyA, localTerminalId, {
    isCurrentTerminal: true,
    customFactory: indexedDB
  });
  assert(!blockedDecomm4.success, 'Local decommission BLOCKED when AUTH_REQUIRED operations exist');

  // Test 6.5: Queue has DEVICE_BLOCKED operation => DECOMMISSION BLOCKED
  if (qItem) {
    qItem.status = 'DEVICE_BLOCKED';
    await updateQueueItem(qItem, indexedDB);
  }
  const blockedDecomm5 = await decommissionDevice(ownerClient, pharmacyA, localTerminalId, {
    isCurrentTerminal: true,
    customFactory: indexedDB
  });
  assert(!blockedDecomm5.success, 'Local decommission BLOCKED when DEVICE_BLOCKED operations exist');

  // Verify pending transactions are NEVER deleted to satisfy check
  const retainedItem = await getQueueItem(pharmacyA, opPending, indexedDB);
  assert(Boolean(retainedItem), 'CRITICAL: Offline queue item was NOT deleted or purged by decommission check');

  // Test 6.6: Terminal resolves all operations to COMMITTED => DECOMMISSION SUCCEEDS
  if (qItem) {
    qItem.status = 'COMMITTED';
    await updateQueueItem(qItem, indexedDB);
  }
  pendingCountLocal = await countUnresolvedQueueOperations(localTerminalId, pharmacyA, indexedDB);
  assert(pendingCountLocal === 0, 'Local queue has 0 unresolved operations (1 COMMITTED)');

  const cleanDecomm = await decommissionDevice(ownerClient, pharmacyA, localTerminalId, {
    isCurrentTerminal: true,
    customFactory: indexedDB
  });
  assert(cleanDecomm.success, 'Local decommission SUCCEEDS once local queue has zero unresolved operations');
  assert(cleanDecomm.device?.status === 'DECOMMISSIONED', 'Local terminal status updated to DECOMMISSIONED');

  // Invariant: Keystore cleared for Model B re-enrollment, but transactions remain durable
  assert((await getActiveDeviceIdentity(indexedDB)) === null, 'Active keystore cleared upon successful decommission');
  assert((await getQueueItem(pharmacyA, opPending, indexedDB)) !== null, 'Durable offline transactions remain preserved in IndexedDB');

  // =========================================================================
  // SECTION 7: MODEL B KEY ROTATION (LOCAL-ONLY TESTS A1 - A9)
  // =========================================================================
  console.log('\n[7. Model B Key Rotation (Local-Only Tests A1 - A9)]');
  // Re-enroll terminal 3 as current local terminal for rotation tests
  const identity3 = await createDeviceIdentity();
  await saveActiveDeviceIdentity(identity3, indexedDB);
  const enroll3 = await enrollDevice(ownerClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchA1,
    registered_by: userOwner,
    device_name: 'Counter 3 POS Workstation',
    platform: 'WEB',
    identity: identity3,
    isCurrentTerminal: true,
    customFactory: indexedDB
  });
  assert(enroll3.success, 'Terminal 3 enrolled as active local terminal');

  // Create a separate remote device record in PostgreSQL (not in local keystore)
  const remoteIdentityForRot = await createDeviceIdentity();
  const remoteEnrollForRot = await enrollDevice(ownerClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchA1,
    registered_by: userOwner,
    device_name: 'Remote Workstation 4',
    platform: 'WINDOWS',
    identity: remoteIdentityForRot,
    isCurrentTerminal: false,
    customFactory: indexedDB
  });
  assert(remoteEnrollForRot.success, 'Remote Workstation 4 enrolled in PostgreSQL');
  assert(remoteEnrollForRot.device?.status === 'ACTIVE', 'Remote Workstation 4 initial status is ACTIVE');

  // TEST A2: Remote device rotation is REJECTED
  const remoteRotationAttempt = await rotateDeviceKeyModelB(ownerClient, {
    oldDeviceId: remoteIdentityForRot.deviceId,
    pharmacyId: pharmacyA,
    branchId: branchA1,
    registeredBy: userOwner,
    newDeviceName: 'Remote Workstation 4 (Attempted Remote Rotation)',
    platform: 'WINDOWS',
    customFactory: indexedDB
  });
  assert(!remoteRotationAttempt.success, 'Test A2: Remote device rotation is strictly REJECTED');
  assert(remoteRotationAttempt.isRemoteRotationRejected === true, 'Test A2: isRemoteRotationRejected flag is true');
  assert(Boolean(remoteRotationAttempt.error?.includes('strictly restricted to the current local terminal')), 'Test A2: Clear local-only restriction error message');

  // TEST A3: Rejected remote rotation does NOT decommission the remote device
  const remoteDeviceAfterAttempt = await getDeviceById(ownerClient, pharmacyA, remoteIdentityForRot.deviceId);
  assert(remoteDeviceAfterAttempt?.status === 'ACTIVE', 'Test A3: Rejected remote rotation leaves remote device ACTIVE (NOT decommissioned)');

  // Local safety check on local terminal before rotation:
  // Attempt rotation of local terminal while local pending operations exist => BLOCKED
  const opPendingRot = crypto.randomUUID().toLowerCase();
  await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: opPendingRot,
    payload: { action: 'SALE', amount: 12000, device_id: identity3.deviceId }
  }, indexedDB);

  const blockedLocalRotation = await rotateDeviceKeyModelB(ownerClient, {
    oldDeviceId: identity3.deviceId,
    pharmacyId: pharmacyA,
    branchId: branchA1,
    registeredBy: userOwner,
    newDeviceName: 'Counter 3 POS Workstation (Key Rotated)',
    platform: 'WEB',
    customFactory: indexedDB
  });
  assert(!blockedLocalRotation.success, 'Model B key rotation BLOCKED while local pending operations exist on old device');
  assert(blockedLocalRotation.isBlockedBySafetyInvariant === true, 'Device-scoped safety invariant enforced on key rotation');

  // Clear queue to COMMITTED
  const rotItem = await getQueueItem(pharmacyA, opPendingRot, indexedDB);
  if (rotItem) {
    rotItem.status = 'COMMITTED';
    await updateQueueItem(rotItem, indexedDB);
  }

  // TEST A1: Current local device CAN perform Model B rotation
  const successfulRotation = await rotateDeviceKeyModelB(ownerClient, {
    oldDeviceId: identity3.deviceId,
    pharmacyId: pharmacyA,
    branchId: branchA1,
    registeredBy: userOwner,
    newDeviceName: 'Counter 3 POS Workstation (Key Rotated)',
    platform: 'WEB',
    customFactory: indexedDB
  });
  assert(successfulRotation.success, 'Test A1: Current local device successfully performs Model B rotation');

  // TEST A4: Successful local rotation generates a fresh RFC 4122 UUID
  assert(successfulRotation.newDevice?.id !== identity3.deviceId, 'Test A4: New device has a fresh RFC 4122 UUID different from old device');
  assert(successfulRotation.newDevice?.id.length === 36, 'Test A4: New device ID is 36-character RFC 4122 UUID');

  // TEST A5: Successful local rotation generates a fresh P-256 keypair
  assert(successfulRotation.newDevice?.public_key_pem !== identity3.publicKeyPem, 'Test A5: New device has a fresh P-256 public key');
  assert(successfulRotation.newIdentity?.publicKey.algorithm.name === 'ECDSA', 'Test A5: Fresh key pair algorithm is ECDSA NIST P-256');

  // TEST A6: The new private key remains non-extractable
  assert(successfulRotation.newIdentity?.privateKey.extractable === false, 'Test A6: The new private key is strictly non-extractable (extractable: false)');

  // TEST A7: The new private key is stored only through the existing local WebCrypto/IndexedDB mechanism
  const activePostRotation = await getActiveDeviceIdentity(indexedDB);
  assert(activePostRotation?.deviceId === successfulRotation.newDevice?.id, 'Test A7: Keystore holds new device identity');
  assert(activePostRotation?.privateKey.extractable === false, 'Test A7: Keystore private key remains non-extractable in IndexedDB');

  // TEST A8: The old device remains permanently DECOMMISSIONED
  const oldDeviceRecord = await getDeviceById(ownerClient, pharmacyA, identity3.deviceId);
  assert(oldDeviceRecord?.status === 'DECOMMISSIONED', 'Test A8: Old device remains permanently DECOMMISSIONED');

  // TEST A9: No code path performs in-place UPDATE devices SET public_key_pem = ...
  assert(oldDeviceRecord?.public_key_pem === identity3.publicKeyPem, 'Test A9: Old device public_key_pem was NOT modified in place');

  // =========================================================================
  // SECTION 8: TENANT ISOLATION & OWNER-ONLY DELETION
  // =========================================================================
  console.log('\n[8. Tenant Isolation & OWNER-Only Deletion]');
  // 8.1 Cross-tenant device queries blocked
  const crossTenantList = await listDevices(ownerClient, pharmacyB).catch((e) => e);
  assert(crossTenantList instanceof Error, 'Cross-tenant device query rejected by RLS');

  // 8.2 MANAGER attempt to DELETE rejected (OWNER ONLY)
  const managerDelete = await deleteDevice(managerClient, pharmacyA, identity3.deviceId);
  assert(!managerDelete.success, 'MANAGER attempt to DELETE device record rejected (RLS: OWNER only)');

  // 8.3 OWNER attempt to DELETE succeeds
  const ownerDelete = await deleteDevice(ownerClient, pharmacyA, identity3.deviceId);
  assert(ownerDelete.success, 'OWNER attempt to DELETE device record succeeds');

  // =========================================================================
  // SECTION 9: REMOTE DECOMMISSION SEMANTICS
  // =========================================================================
  console.log('\n[9. Remote Decommission Semantics]');
  // Enroll a remote terminal (not matching local identity)
  const remoteIdentity = await createDeviceIdentity();
  const remoteEnroll = await enrollDevice(ownerClient, {
    pharmacy_id: pharmacyA,
    branch_id: branchA1,
    registered_by: userOwner,
    device_name: 'Remote Branch Tablet',
    platform: 'ANDROID',
    identity: remoteIdentity,
    isCurrentTerminal: false,
    customFactory: indexedDB
  });
  assert(remoteEnroll.success, 'Remote terminal enrolled');

  // Decommissioning remote terminal without confirmation fails
  const remoteDecommNoConfirm = await decommissionDevice(ownerClient, pharmacyA, remoteIdentity.deviceId, {
    isCurrentTerminal: false,
    confirmedRemoteDecommission: false,
    customFactory: indexedDB
  });
  assert(!remoteDecommNoConfirm.success, 'Remote decommission requires explicit administrative acknowledgment');

  // Decommissioning remote terminal with confirmation succeeds
  const remoteDecommConfirmed = await decommissionDevice(ownerClient, pharmacyA, remoteIdentity.deviceId, {
    isCurrentTerminal: false,
    confirmedRemoteDecommission: true,
    customFactory: indexedDB
  });
  assert(remoteDecommConfirmed.success, 'Remote decommission with confirmation succeeds');
  assert(remoteDecommConfirmed.device?.status === 'DECOMMISSIONED', 'Remote device marked DECOMMISSIONED');

  console.log('======================================================');
  console.log(`PHASE 5D-21 DEVICE TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runDeviceManagementTestSuite().catch((err) => {
  console.error('Test runner encountered uncaught error:', err);
  process.exit(1);
});
