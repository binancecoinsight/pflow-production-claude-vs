/**
 * PharmacyFlow Dedicated Device Management Service (Phase 5D-21)
 * 
 * Provides lifecycle operations, administrative enrollment, local queue safety validation,
 * Model B key rotation, and current-terminal cryptographic detection.
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. deviceIdentity.deviceId === public.devices.id
 * 2. Dedicated lifecycle operations (blockDevice, unblockDevice, decommissionDevice).
 *    Generic arbitrary updateDevice() is strictly prohibited.
 * 3. UPDATE devices SET public_key_pem = ... is NEVER permitted.
 * 4. DECOMMISSIONED -> ACTIVE is strictly FORBIDDEN.
 * 5. Mandatory Local Decommission Safety:
 *    pendingOfflineOperations(deviceId) > 0 => DECOMMISSION BLOCKED.
 * 6. Model B Retire + Re-Enroll for key rotation: old device retired, brand new UUID & key pair enrolled.
 * 7. Zero browser fingerprinting: visual public-key SHA-256 fingerprint only.
 * 8. Device ≠ User separation: logging out a user never touches the device keystore or offline queue.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  Device,
  DeviceStatus,
  DevicePlatform,
  EnrollDeviceParams,
  EnrollDeviceResult,
  DecommissionOptions,
  DecommissionResult,
  DeviceActionResult,
  CurrentTerminalDetection,
  RotateKeyModelBParams,
  RotateKeyModelBResult
} from './types';
import {
  createDeviceIdentity,
  getActiveDeviceIdentity,
  saveActiveDeviceIdentity,
  clearActiveDeviceIdentity,
  computePublicKeyFingerprint
} from '../crypto/deviceIdentity';
import { countUnresolvedQueueOperations } from '../offline/db';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUuid = (val: unknown): boolean => {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
};

const VALID_PLATFORMS: DevicePlatform[] = ['ANDROID', 'WINDOWS', 'WEB', 'IOS'];

/**
 * Lists all registered devices for an authenticated pharmacy workspace.
 * Governed strictly by PostgreSQL RLS policy `rls_devices_select`.
 */
export const listDevices = async (
  client: SupabaseClient,
  pharmacyId: string
): Promise<Device[]> => {
  if (!isValidUuid(pharmacyId)) {
    throw new Error(`Invalid pharmacy_id: ${pharmacyId}`);
  }

  const { data, error } = await client
    .from('devices')
    .select('*')
    .eq('pharmacy_id', pharmacyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list devices: ${error.message}`);
  }

  return (data || []) as Device[];
};

/**
 * Fetches a single device by its primary identifier within the pharmacy tenant.
 */
export const getDeviceById = async (
  client: SupabaseClient,
  pharmacyId: string,
  deviceId: string
): Promise<Device | null> => {
  if (!isValidUuid(pharmacyId) || !isValidUuid(deviceId)) {
    return null;
  }

  const { data, error } = await client
    .from('devices')
    .select('*')
    .eq('pharmacy_id', pharmacyId)
    .eq('id', deviceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch device: ${error.message}`);
  }

  return (data as Device) || null;
};

/**
 * Enrolls a new POS terminal into the pharmacy workspace.
 * 
 * Invariants:
 * - deviceIdentity.deviceId === public.devices.id
 * - P-256 WebCrypto key pair is strictly non-extractable.
 * - Private key is NEVER transmitted or serialized.
 * - Only the public key (SPKI PEM) is registered with the database.
 */
export const enrollDevice = async (
  client: SupabaseClient,
  params: EnrollDeviceParams
): Promise<EnrollDeviceResult> => {
  // 1. Parameter Validation
  if (!isValidUuid(params.pharmacy_id)) {
    return { success: false, error: `Invalid pharmacy_id: ${params.pharmacy_id}` };
  }
  if (!isValidUuid(params.branch_id)) {
    return { success: false, error: `Invalid branch_id: ${params.branch_id}` };
  }
  if (!isValidUuid(params.registered_by)) {
    return { success: false, error: `Invalid registered_by: ${params.registered_by}` };
  }
  if (!params.device_name || params.device_name.trim().length === 0) {
    return { success: false, error: 'Device name is required' };
  }
  if (params.device_name.trim().length > 64) {
    return { success: false, error: 'Device name cannot exceed 64 characters' };
  }
  if (!VALID_PLATFORMS.includes(params.platform)) {
    return { success: false, error: `Invalid device platform: ${params.platform}` };
  }

  // 2. Cryptographic Identity
  const identity = params.identity || (await createDeviceIdentity());

  // 3. Database Insertion Payload
  const insertPayload = {
    id: identity.deviceId,
    pharmacy_id: params.pharmacy_id,
    branch_id: params.branch_id,
    registered_by: params.registered_by,
    device_name: params.device_name.trim(),
    platform: params.platform,
    is_hardware_keystore: false,
    public_key_pem: identity.publicKeyPem,
    status: 'ACTIVE' as DeviceStatus
  };

  const { data, error } = await client
    .from('devices')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    return { success: false, error: `Enrollment failed: ${error.message}` };
  }

  // 4. If current terminal, persist identity in local IndexedDB keystore
  if (params.isCurrentTerminal !== false) {
    try {
      await saveActiveDeviceIdentity(identity, params.customFactory);
    } catch (saveErr) {
      console.warn('[PharmacyFlow Device] Keystore save notice:', saveErr);
    }
  }

  return {
    success: true,
    device: data as Device,
    identity
  };
};

/**
 * Transitions an ACTIVE device to BLOCKED status.
 * Reversible administrative suspension (e.g. security hold, suspicious activity).
 * 
 * Invariants:
 * - Dedicated status mutation only. Never modifies public_key_pem or other metadata.
 * - DECOMMISSIONED devices cannot be blocked (permanently retired).
 */
export const blockDevice = async (
  client: SupabaseClient,
  pharmacyId: string,
  deviceId: string
): Promise<DeviceActionResult> => {
  if (!isValidUuid(pharmacyId) || !isValidUuid(deviceId)) {
    return { success: false, error: 'Invalid identifier format' };
  }

  const existing = await getDeviceById(client, pharmacyId, deviceId);
  if (!existing) {
    return { success: false, error: 'Device not found' };
  }

  if (existing.status === 'DECOMMISSIONED') {
    return {
      success: false,
      error: 'Lifecycle violation: DECOMMISSIONED devices are permanently retired and cannot be blocked.'
    };
  }

  if (existing.status === 'BLOCKED') {
    return { success: true, device: existing };
  }

  const { data, error } = await client
    .from('devices')
    .update({ status: 'BLOCKED' })
    .eq('id', deviceId)
    .eq('pharmacy_id', pharmacyId)
    .select()
    .single();

  if (error) {
    return { success: false, error: `Failed to block device: ${error.message}` };
  }

  return { success: true, device: data as Device };
};

/**
 * Transitions a BLOCKED device back to ACTIVE status.
 * 
 * Invariants:
 * - Dedicated status mutation only.
 * - DECOMMISSIONED -> ACTIVE is strictly FORBIDDEN.
 */
export const unblockDevice = async (
  client: SupabaseClient,
  pharmacyId: string,
  deviceId: string
): Promise<DeviceActionResult> => {
  if (!isValidUuid(pharmacyId) || !isValidUuid(deviceId)) {
    return { success: false, error: 'Invalid identifier format' };
  }

  const existing = await getDeviceById(client, pharmacyId, deviceId);
  if (!existing) {
    return { success: false, error: 'Device not found' };
  }

  if (existing.status === 'DECOMMISSIONED') {
    return {
      success: false,
      error: 'Lifecycle violation: DECOMMISSIONED -> ACTIVE is strictly FORBIDDEN. A decommissioned device identity is permanently retired. Use Model B Retire + Re-Enroll.'
    };
  }

  if (existing.status === 'ACTIVE') {
    return { success: true, device: existing };
  }

  const { data, error } = await client
    .from('devices')
    .update({ status: 'ACTIVE' })
    .eq('id', deviceId)
    .eq('pharmacy_id', pharmacyId)
    .select()
    .single();

  if (error) {
    return { success: false, error: `Failed to unblock device: ${error.message}` };
  }

  return { success: true, device: data as Device };
};

/**
 * Permanently decommissions a device terminal.
 * 
 * MANDATORY SAFETY INVARIANTS:
 * 1. If decommissioning the currently active terminal:
 *    Inspects the local offline queue.
 *    pendingOfflineOperations(deviceId) > 0 => DECOMMISSION BLOCKED.
 *    The terminal CANNOT be decommissioned while unresolved offline operations remain.
 * 2. If decommissioning a remote terminal:
 *    The server cannot inspect remote IndexedDB.
 *    Requires explicit confirmation flag `confirmedRemoteDecommission === true` acknowledging
 *    that unsynchronized offline operations on the remote terminal may be stranded.
 * 3. Status transition to DECOMMISSIONED is strictly one-way and irreversible.
 * 4. Does NOT delete historical offline records or logs from IndexedDB.
 */
export const decommissionDevice = async (
  client: SupabaseClient,
  pharmacyId: string,
  deviceId: string,
  options?: DecommissionOptions
): Promise<DecommissionResult> => {
  if (!isValidUuid(pharmacyId) || !isValidUuid(deviceId)) {
    return { success: false, error: 'Invalid identifier format' };
  }

  const existing = await getDeviceById(client, pharmacyId, deviceId);
  if (!existing) {
    return { success: false, error: 'Device not found' };
  }

  if (existing.status === 'DECOMMISSIONED') {
    return { success: true, device: existing };
  }

  // 1. Determine if this is the active terminal in the current browser/workstation
  const localIdentity = await getActiveDeviceIdentity(options?.customFactory);
  const isLocalTerminal =
    options?.isCurrentTerminal === true ||
    Boolean(localIdentity && localIdentity.deviceId.toLowerCase() === deviceId.toLowerCase());

  // 2. Safety Evaluation
  if (isLocalTerminal) {
    const pendingCount = await countUnresolvedQueueOperations(deviceId, pharmacyId, options?.customFactory);
    if (pendingCount > 0) {
      return {
        success: false,
        error: `Local decommission BLOCKED: ${pendingCount} unresolved offline operation(s) remain in the local queue. Connect to the network and allow the sync dispatcher to complete before decommissioning.`,
        pendingCount,
        isBlockedBySafetyInvariant: true
      };
    }
  } else {
    // Remote terminal: server cannot inspect remote IndexedDB
    if (options?.confirmedRemoteDecommission !== true) {
      return {
        success: false,
        error: 'Remote decommission requires explicit administrative confirmation acknowledging that unsynchronized transactions on the remote workstation may be permanently stranded.'
      };
    }
  }

  // 3. Update Database Status to DECOMMISSIONED
  const { data, error } = await client
    .from('devices')
    .update({ status: 'DECOMMISSIONED' })
    .eq('id', deviceId)
    .eq('pharmacy_id', pharmacyId)
    .select()
    .single();

  if (error) {
    return { success: false, error: `Failed to decommission device: ${error.message}` };
  }

  // 4. If current terminal, clear active device identity from keystore to enable re-enrollment
  if (isLocalTerminal) {
    try {
      await clearActiveDeviceIdentity(options?.customFactory);
    } catch (clearErr) {
      console.warn('[PharmacyFlow Device] Keystore clear notice:', clearErr);
    }
  }

  return {
    success: true,
    device: data as Device,
    pendingCount: 0
  };
};

/**
 * Deletes a device record from the database.
 * Governed strictly by PostgreSQL RLS policy `rls_devices_delete`: OWNER ONLY.
 */
export const deleteDevice = async (
  client: SupabaseClient,
  pharmacyId: string,
  deviceId: string
): Promise<DeviceActionResult> => {
  if (!isValidUuid(pharmacyId) || !isValidUuid(deviceId)) {
    return { success: false, error: 'Invalid identifier format' };
  }

  const { error } = await client
    .from('devices')
    .delete()
    .eq('id', deviceId)
    .eq('pharmacy_id', pharmacyId);

  if (error) {
    return { success: false, error: `Failed to delete device: ${error.message}` };
  }

  return { success: true };
};

/**
 * Detects whether the current browser workstation has an enrolled cryptographic device identity.
 * 
 * Comparison invariant:
 * local deviceIdentity.deviceId === public.devices.id
 * 
 * Zero browser fingerprinting.
 */
export const detectCurrentTerminal = async (
  client: SupabaseClient,
  pharmacyId: string,
  customFactory?: IDBFactory
): Promise<CurrentTerminalDetection> => {
  const localIdentity = await getActiveDeviceIdentity(customFactory);
  const pendingOfflineCount = localIdentity
    ? await countUnresolvedQueueOperations(localIdentity.deviceId, pharmacyId, customFactory)
    : 0;

  if (!localIdentity) {
    return {
      isEnrolled: false,
      localIdentity: null,
      registeredDevice: null,
      status: 'UNENROLLED',
      pendingOfflineCount: 0,
      publicKeyFingerprint: null
    };
  }

  const fingerprint = await computePublicKeyFingerprint(localIdentity.publicKeyPem);

  if (!isValidUuid(pharmacyId)) {
    return {
      isEnrolled: false,
      localIdentity,
      registeredDevice: null,
      status: 'UNENROLLED',
      pendingOfflineCount,
      publicKeyFingerprint: fingerprint
    };
  }

  const registeredDevice = await getDeviceById(client, pharmacyId, localIdentity.deviceId);

  if (!registeredDevice) {
    return {
      isEnrolled: false,
      localIdentity,
      registeredDevice: null,
      status: 'NOT_FOUND_ON_SERVER',
      pendingOfflineCount,
      publicKeyFingerprint: fingerprint
    };
  }

  return {
    isEnrolled: registeredDevice.status === 'ACTIVE',
    localIdentity,
    registeredDevice,
    status: registeredDevice.status,
    pendingOfflineCount,
    publicKeyFingerprint: fingerprint
  };
};

/**
 * Key Rotation: MODEL B — RETIRE + RE-ENROLL (STRICTLY LOCAL-ONLY)
 * 
 * Flow:
 * 1. ENFORCE: selectedDevice.id === localDeviceIdentity.deviceId.
 *    If the target device is remote, the rotation operation is REJECTED IMMEDIATELY
 *    before retiring or decommissioning anything. The remote device remains untouched.
 * 2. OLD DEVICE: Decommissioned with local device-scoped queue safety validation.
 * 3. NEW DEVICE ID + NEW P-256 KEYPAIR: Fresh cryptographic identity generated.
 * 4. NEW ENROLLMENT: Enrolled as a brand new device record in `public.devices`.
 * 5. KEYSTORE: New private key stored only locally in this workstation's IndexedDB.
 * 
 * Invariants:
 * - Never modifies `public_key_pem` on the old device.
 * - Does not invent in-place key replacement or remote key escrow.
 */
export const rotateDeviceKeyModelB = async (
  client: SupabaseClient,
  params: RotateKeyModelBParams
): Promise<RotateKeyModelBResult> => {
  // Step 0: CRITICAL ENFORCEMENT — Model B rotation MUST be local-terminal only.
  // Reject immediately if the selected device is remote, preserving remote device untouched.
  const localIdentity = await getActiveDeviceIdentity(params.customFactory);
  if (!localIdentity || localIdentity.deviceId.toLowerCase().trim() !== params.oldDeviceId.toLowerCase().trim()) {
    return {
      success: false,
      error: 'Model B Key Rotation is strictly restricted to the current local terminal. The replacement private key must be generated and stored on the physical workstation hosting the terminal. To rotate a remote terminal, access that physical workstation directly.',
      isRemoteRotationRejected: true
    };
  }

  // Step 1: Decommission the old local device identity (enforcing device-scoped queue safety)
  const decommResult = await decommissionDevice(client, params.pharmacyId, params.oldDeviceId, {
    isCurrentTerminal: true,
    customFactory: params.customFactory
  });

  if (!decommResult.success) {
    return {
      success: false,
      error: decommResult.error || 'Failed to decommission old device identity during key rotation',
      isBlockedBySafetyInvariant: decommResult.isBlockedBySafetyInvariant
    };
  }

  // Step 2: Generate brand new device identity (fresh RFC 4122 UUID + fresh non-extractable P-256 key pair)
  const freshIdentity = await createDeviceIdentity();

  // Step 3: Enroll fresh device identity
  const enrollResult = await enrollDevice(client, {
    pharmacy_id: params.pharmacyId,
    branch_id: params.branchId,
    registered_by: params.registeredBy,
    device_name: params.newDeviceName,
    platform: params.platform,
    identity: freshIdentity,
    isCurrentTerminal: true,
    customFactory: params.customFactory
  });

  if (!enrollResult.success || !enrollResult.device) {
    return {
      success: false,
      oldDevice: decommResult.device,
      error: enrollResult.error || 'Failed to enroll new device identity during key rotation'
    };
  }

  return {
    success: true,
    oldDevice: decommResult.device,
    newDevice: enrollResult.device,
    newIdentity: freshIdentity
  };
};
