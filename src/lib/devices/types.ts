/**
 * PharmacyFlow Device Management Contracts (Phase 5D-21)
 * 
 * Architectural Invariants:
 * 1. deviceIdentity.deviceId === public.devices.id
 * 2. Status transitions:
 *    UNENROLLED -> ACTIVE
 *    ACTIVE <-> BLOCKED
 *    ACTIVE -> DECOMMISSIONED
 *    BLOCKED -> DECOMMISSIONED
 *    DECOMMISSIONED -> ACTIVE is strictly FORBIDDEN.
 * 3. Key rotation: MODEL B (Retire + Re-Enroll) ONLY.
 * 4. Local Decommission Safety Invariant:
 *    pendingOfflineOperations(deviceId) > 0 => DECOMMISSION BLOCKED.
 */

import { Device, DeviceStatus, DevicePlatform } from '../../types/database';
import { DeviceIdentity } from '../crypto/deviceIdentity';

export type { Device, DeviceStatus, DevicePlatform };

export interface EnrollDeviceParams {
  pharmacy_id: string;
  branch_id: string;
  registered_by: string;
  device_name: string;
  platform: DevicePlatform;
  identity?: DeviceIdentity;
  isCurrentTerminal?: boolean;
  customFactory?: IDBFactory;
}

export interface EnrollDeviceResult {
  success: boolean;
  device?: Device;
  identity?: DeviceIdentity;
  error?: string;
}

export interface DecommissionOptions {
  isCurrentTerminal?: boolean;
  confirmedRemoteDecommission?: boolean;
  customFactory?: IDBFactory;
}

export interface DecommissionResult {
  success: boolean;
  device?: Device;
  error?: string;
  pendingCount?: number;
  isBlockedBySafetyInvariant?: boolean;
}

export interface DeviceActionResult {
  success: boolean;
  device?: Device;
  error?: string;
}

export type TerminalEnrollmentState =
  | 'ACTIVE'
  | 'BLOCKED'
  | 'DECOMMISSIONED'
  | 'UNENROLLED'
  | 'NOT_FOUND_ON_SERVER';

export interface CurrentTerminalDetection {
  isEnrolled: boolean;
  localIdentity: DeviceIdentity | null;
  registeredDevice: Device | null;
  status: TerminalEnrollmentState;
  pendingOfflineCount: number;
  publicKeyFingerprint: string | null;
}

export interface RotateKeyModelBParams {
  oldDeviceId: string;
  pharmacyId: string;
  branchId: string;
  registeredBy: string;
  newDeviceName: string;
  platform: DevicePlatform;
  customFactory?: IDBFactory;
}

export interface RotateKeyModelBResult {
  success: boolean;
  oldDevice?: Device;
  newDevice?: Device;
  newIdentity?: DeviceIdentity;
  error?: string;
  isBlockedBySafetyInvariant?: boolean;
  isRemoteRotationRejected?: boolean;
}
