import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Laptop,
  Smartphone,
  Monitor,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  Lock,
  Unlock,
  PowerOff,
  Key,
  Search,
  Building2,
  Clock,
  Radio,
  X,
  AlertCircle,
  HelpCircle,
  Check
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  Device,
  DeviceStatus,
  DevicePlatform,
  CurrentTerminalDetection,
  listDevices,
  enrollDevice,
  blockDevice,
  unblockDevice,
  decommissionDevice,
  deleteDevice,
  detectCurrentTerminal,
  rotateDeviceKeyModelB
} from '../../lib/devices/index';
import { Branch } from '../../types/database';
import { CapabilityAsyncBoundary } from '../../lib/subscription/capabilityBoundary';

export const DeviceManagementView: React.FC<{ enrollmentAllowed?: boolean }> = ({ enrollmentAllowed = true }) => {
  const { user, pharmacy, branch, role, permissions } = useAuth();

  // Role permissions
  const canEnroll = enrollmentAllowed && (role === 'OWNER' || role === 'MANAGER' || permissions.includes('device.enroll'));
  const canBlock = role === 'OWNER' || role === 'MANAGER' || permissions.includes('device.block');
  const canDelete = role === 'OWNER';

  // Data states
  const [devices, setDevices] = useState<Device[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentTerminal, setCurrentTerminal] = useState<CurrentTerminalDetection | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DeviceStatus>('ALL');

  // Messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState<boolean>(false);
  const [enrollName, setEnrollName] = useState<string>('');
  const [enrollBranchId, setEnrollBranchId] = useState<string>('');
  const [enrollPlatform, setEnrollPlatform] = useState<DevicePlatform>('WEB');
  const [enrollIsThisWorkstation, setEnrollIsThisWorkstation] = useState<boolean>(true);
  const [isEnrolling, setIsEnrolling] = useState<boolean>(false);

  // Action Modals
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [decommissionTarget, setDecommissionTarget] = useState<Device | null>(null);
  const [confirmedRemoteNotice, setConfirmedRemoteNotice] = useState<boolean>(false);
  const [rotateKeyTarget, setRotateKeyTarget] = useState<Device | null>(null);
  const [rotateName, setRotateName] = useState<string>('');
  const [rotateBranchId, setRotateBranchId] = useState<string>('');
  const [rotatePlatform, setRotatePlatform] = useState<DevicePlatform>('WEB');
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);

  const activePharmacyIdRef = useRef<string | null>(null);
  const enrollmentBoundaryRef = useRef(new CapabilityAsyncBoundary('', enrollmentAllowed));

  // 1. Load Data
  const loadData = useCallback(async () => {
    if (!pharmacy?.id) return;
    setIsLoading(true);
    setErrorMessage(null);
    activePharmacyIdRef.current = pharmacy.id;

    try {
      // 1.1 List devices
      const deviceList = await listDevices(supabase, pharmacy.id);
      if (activePharmacyIdRef.current !== pharmacy.id) return;
      setDevices(deviceList);

      // 1.2 Detect current terminal
      const terminalInfo = await detectCurrentTerminal(supabase, pharmacy.id);
      if (activePharmacyIdRef.current !== pharmacy.id) return;
      setCurrentTerminal(terminalInfo);

      // 1.3 Load branches for assignment dropdowns
      const { data: branchData } = await supabase
        .from('branches')
        .select('*')
        .eq('pharmacy_id', pharmacy.id)
        .order('name', { ascending: true });

      if (activePharmacyIdRef.current === pharmacy.id && branchData) {
        setBranches(branchData);
        if (!enrollBranchId && branchData.length > 0) {
          setEnrollBranchId(branch?.id || branchData[0].id);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load device information';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [pharmacy?.id, branch?.id, enrollBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (enrollmentBoundaryRef.current.update(pharmacy?.id || '', enrollmentAllowed)) {
      setIsEnrolling(false);
      setIsRotating(false);
      setActionLoadingId(null);
    }
    if (enrollmentAllowed) return;
    setIsEnrollModalOpen(false);
    setRotateKeyTarget(null);
  }, [pharmacy?.id, enrollmentAllowed]);

  useEffect(() => () => enrollmentBoundaryRef.current.invalidate(), []);

  // Filtered devices
  const filteredDevices = devices.filter((d) => {
    const matchesSearch =
      d.device_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.platform.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getBranchName = (bId: string): string => {
    const found = branches.find((b) => b.id === bId);
    return found ? found.name : 'Unknown Branch';
  };

  const getPlatformIcon = (platform: DevicePlatform) => {
    switch (platform) {
      case 'ANDROID':
      case 'IOS':
        return <Smartphone className="w-4 h-4 text-emerald-400" />;
      case 'WINDOWS':
        return <Monitor className="w-4 h-4 text-blue-400" />;
      case 'WEB':
      default:
        return <Laptop className="w-4 h-4 text-teal-400" />;
    }
  };

  const getStatusBadge = (status: DeviceStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            ACTIVE
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Lock className="w-3 h-3" />
            BLOCKED
          </span>
        );
      case 'DECOMMISSIONED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <PowerOff className="w-3 h-3" />
            DECOMMISSIONED
          </span>
        );
      default:
        return null;
    }
  };

  // Actions
  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mutationToken = enrollmentBoundaryRef.current.begin();
    if (!pharmacy?.id || !user?.id || !canEnroll || !mutationToken) return;
    if (!enrollName.trim()) {
      setErrorMessage('Device name is required');
      return;
    }
    if (!enrollBranchId) {
      setErrorMessage('Branch assignment is required');
      return;
    }

    setIsEnrolling(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await enrollDevice(supabase, {
        pharmacy_id: pharmacy.id,
        branch_id: enrollBranchId,
        registered_by: user.id,
        device_name: enrollName.trim(),
        platform: enrollPlatform,
        isCurrentTerminal: enrollIsThisWorkstation
      });
      if (!enrollmentBoundaryRef.current.accepts(mutationToken)) return;

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to enroll device');
        return;
      }

      setSuccessMessage(`Terminal "${enrollName}" enrolled successfully.`);
      setIsEnrollModalOpen(false);
      setEnrollName('');
      await loadData();
    } catch (err: unknown) {
      if (!enrollmentBoundaryRef.current.accepts(mutationToken)) return;
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected enrollment error');
    } finally {
      if (enrollmentBoundaryRef.current.accepts(mutationToken)) setIsEnrolling(false);
    }
  };

  const handleBlock = async (deviceId: string) => {
    if (!pharmacy?.id || !canBlock) return;
    setActionLoadingId(deviceId);
    setErrorMessage(null);

    try {
      const result = await blockDevice(supabase, pharmacy.id, deviceId);
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to block device');
        return;
      }
      setSuccessMessage('Terminal has been BLOCKED. Synchronization suspended.');
      await loadData();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Block action failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnblock = async (deviceId: string) => {
    if (!pharmacy?.id || !canBlock) return;
    setActionLoadingId(deviceId);
    setErrorMessage(null);

    try {
      const result = await unblockDevice(supabase, pharmacy.id, deviceId);
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to unblock device');
        return;
      }
      setSuccessMessage('Terminal has been UNBLOCKED and returned to ACTIVE status.');
      await loadData();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unblock action failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecommissionConfirm = async () => {
    if (!pharmacy?.id || !decommissionTarget || !canBlock) return;
    setActionLoadingId(decommissionTarget.id);
    setErrorMessage(null);

    const isCurrent =
      Boolean(currentTerminal?.localIdentity?.deviceId) &&
      currentTerminal?.localIdentity?.deviceId.toLowerCase() === decommissionTarget.id.toLowerCase();

    try {
      const result = await decommissionDevice(supabase, pharmacy.id, decommissionTarget.id, {
        isCurrentTerminal: isCurrent,
        confirmedRemoteDecommission: !isCurrent ? confirmedRemoteNotice : false
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Decommission action failed');
        return;
      }

      setSuccessMessage(`Terminal "${decommissionTarget.device_name}" permanently DECOMMISSIONED.`);
      setDecommissionTarget(null);
      setConfirmedRemoteNotice(false);
      await loadData();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Decommission action failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRotateKeyConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    const mutationToken = enrollmentBoundaryRef.current.begin();
    if (!pharmacy?.id || !user?.id || !rotateKeyTarget || !canEnroll || !mutationToken) return;
    if (!rotateName.trim()) {
      setErrorMessage('Replacement device name is required');
      return;
    }

    const isCurrent =
      Boolean(currentTerminal?.localIdentity?.deviceId) &&
      currentTerminal?.localIdentity?.deviceId.toLowerCase() === rotateKeyTarget.id.toLowerCase();

    if (!isCurrent) {
      setErrorMessage(
        'Model B Key Rotation is strictly restricted to the current local terminal. The replacement private key must be generated and stored on the physical workstation hosting the terminal. To rotate a remote terminal, access that physical workstation directly.'
      );
      setRotateKeyTarget(null);
      return;
    }

    setIsRotating(true);
    setErrorMessage(null);

    try {
      const result = await rotateDeviceKeyModelB(supabase, {
        oldDeviceId: rotateKeyTarget.id,
        pharmacyId: pharmacy.id,
        branchId: rotateBranchId || rotateKeyTarget.branch_id,
        registeredBy: user.id,
        newDeviceName: rotateName.trim(),
        platform: rotatePlatform
      });
      if (!enrollmentBoundaryRef.current.accepts(mutationToken)) return;

      if (!result.success) {
        setErrorMessage(result.error || 'Key rotation failed');
        return;
      }

      setSuccessMessage(`Model B Key Rotation successful. Retired "${rotateKeyTarget.device_name}" and enrolled fresh terminal "${rotateName}".`);
      setRotateKeyTarget(null);
      setRotateName('');
      await loadData();
    } catch (err: unknown) {
      if (!enrollmentBoundaryRef.current.accepts(mutationToken)) return;
      setErrorMessage(err instanceof Error ? err.message : 'Rotation action failed');
    } finally {
      if (enrollmentBoundaryRef.current.accepts(mutationToken)) setIsRotating(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pharmacy?.id || !deleteTarget || !canDelete) return;
    setActionLoadingId(deleteTarget.id);
    setErrorMessage(null);

    try {
      const result = await deleteDevice(supabase, pharmacy.id, deleteTarget.id);
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to delete device');
        return;
      }
      setSuccessMessage(`Device record "${deleteTarget.device_name}" deleted.`);
      setDeleteTarget(null);
      await loadData();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Delete action failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const isDecommissionTargetCurrent =
    Boolean(decommissionTarget) &&
    Boolean(currentTerminal?.localIdentity?.deviceId) &&
    currentTerminal?.localIdentity?.deviceId.toLowerCase() === decommissionTarget?.id.toLowerCase();

  return (
    <div className="space-y-6">
      {!enrollmentAllowed && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200" role="status">
          Advisory subscription containment: new device enrollment and replacement-key enrollment are disabled. Device history and existing security/recovery controls retain their existing role authorization.
        </div>
      )}
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-medium mb-2">
            <Shield className="w-3.5 h-3.5" />
            <span>Cryptographic Device Identity & POS Terminal Security</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Device & Terminal Management
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Governed by NIST P-256 ECDSA cryptographic signatures and PostgreSQL Row Level Security M-4.
            Enforces strict device-versus-user separation and Model B key rotation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition cursor-pointer"
            title="Refresh Devices"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {canEnroll && (
            <button
              onClick={() => {
                setEnrollIsThisWorkstation(!currentTerminal?.isEnrolled);
                setIsEnrollModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Enroll New Terminal</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Current Terminal Cryptographic Status Card */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800/90 text-teal-400 border border-slate-700/60">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Current Workstation Status
              </div>
              <div className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                {currentTerminal?.isEnrolled ? (
                  <>
                    <span>{currentTerminal.registeredDevice?.device_name || 'Enrolled Terminal'}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      THIS WORKSTATION
                    </span>
                  </>
                ) : currentTerminal?.localIdentity ? (
                  <span className="text-amber-400">Identity Initialized (Awaiting Enrollment)</span>
                ) : (
                  <span className="text-slate-400">Unenrolled Terminal</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentTerminal?.status === 'ACTIVE' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ACTIVE POS WORKSTATION
              </span>
            )}
            {currentTerminal?.status === 'BLOCKED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Lock className="w-3.5 h-3.5" />
                BLOCKED BY ADMINISTRATOR
              </span>
            )}
            {currentTerminal?.status === 'DECOMMISSIONED' && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                <PowerOff className="w-3.5 h-3.5" />
                PERMANENTLY DECOMMISSIONED
              </span>
            )}
            {currentTerminal?.status === 'UNENROLLED' && canEnroll && (
              <button
                onClick={() => {
                  setEnrollIsThisWorkstation(true);
                  setIsEnrollModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Enroll This Machine
              </button>
            )}
          </div>
        </div>

        {/* Current Terminal Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 text-xs">
          <div>
            <span className="text-slate-500 block mb-0.5">Authoritative Device ID:</span>
            <span className="font-mono text-slate-300 break-all">
              {currentTerminal?.localIdentity?.deviceId || 'No local keystore registered'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">P-256 Public Key Digest:</span>
            <span className="font-mono text-slate-300 break-all">
              {currentTerminal?.publicKeyFingerprint || 'None'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              (Human visual aid only • No fingerprinting)
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Assigned Branch:</span>
            <span className="text-slate-200 font-medium">
              {currentTerminal?.registeredDevice
                ? getBranchName(currentTerminal.registeredDevice.branch_id)
                : 'Not Registered'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block mb-0.5">Local Pending Operations:</span>
            <span
              className={`font-semibold ${
                (currentTerminal?.pendingOfflineCount || 0) > 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {currentTerminal?.pendingOfflineCount || 0} unsynchronized
            </span>
            {(currentTerminal?.pendingOfflineCount || 0) > 0 && (
              <span className="text-[10px] text-amber-500/80 block mt-0.5">
                Protects terminal against decommissioning
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, ID, or platform..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
          {(['ALL', 'ACTIVE', 'BLOCKED', 'DECOMMISSIONED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                statusFilter === st
                  ? 'bg-slate-800 text-teal-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Enrolled Devices List */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Laptop className="w-4 h-4 text-teal-400" />
            <span>Enrolled Devices ({filteredDevices.length})</span>
          </div>
          <span className="text-xs text-slate-500 font-mono">public.devices</span>
        </div>

        {filteredDevices.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-teal-400" />
                <span>Loading registered devices...</span>
              </div>
            ) : (
              <span>No registered devices matching criteria.</span>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800/80">
                <tr>
                  <th className="py-3 px-4 font-semibold">Device Name & ID</th>
                  <th className="py-3 px-4 font-semibold">Platform</th>
                  <th className="py-3 px-4 font-semibold">Assigned Branch</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Registered</th>
                  <th className="py-3 px-4 font-semibold">Last Seen</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDevices.map((dev) => {
                  const isCurrent =
                    Boolean(currentTerminal?.localIdentity?.deviceId) &&
                    currentTerminal?.localIdentity?.deviceId.toLowerCase() === dev.id.toLowerCase();
                  const isLoadingAction = actionLoadingId === dev.id;

                  return (
                    <tr
                      key={dev.id}
                      className={`hover:bg-slate-800/30 transition ${
                        isCurrent ? 'bg-teal-500/[0.03]' : ''
                      }`}
                    >
                      {/* Name & ID */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <span>{dev.device_name}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-teal-500/20 text-teal-300 border border-teal-500/30">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 truncate max-w-[220px]" title={dev.id}>
                          {dev.id}
                        </div>
                      </td>

                      {/* Platform */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          {getPlatformIcon(dev.platform)}
                          <span>{dev.platform}</span>
                        </div>
                      </td>

                      {/* Branch */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-300">{getBranchName(dev.branch_id)}</span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">{getStatusBadge(dev.status)}</td>

                      {/* Registered */}
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(dev.created_at).toLocaleDateString()}
                      </td>

                      {/* Last Seen */}
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {dev.last_seen_at ? new Date(dev.last_seen_at).toLocaleTimeString() : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        {isLoadingAction ? (
                          <div className="inline-block p-1 text-slate-400">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* ACTIVE: Block or Decommission or Rotate */}
                            {dev.status === 'ACTIVE' && canBlock && (
                              <button
                                onClick={() => handleBlock(dev.id)}
                                className="px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                                title="Temporarily block POS synchronization"
                              >
                                <Lock className="w-3 h-3" />
                                <span>Block</span>
                              </button>
                            )}

                            {/* BLOCKED: Unblock or Decommission */}
                            {dev.status === 'BLOCKED' && canBlock && (
                              <button
                                onClick={() => handleUnblock(dev.id)}
                                className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                                title="Restore active status"
                              >
                                <Unlock className="w-3 h-3" />
                                <span>Unblock</span>
                              </button>
                            )}

                            {/* Non-decommissioned: can Decommission */}
                            {dev.status !== 'DECOMMISSIONED' && canBlock && (
                              <button
                                onClick={() => {
                                  setDecommissionTarget(dev);
                                  setConfirmedRemoteNotice(false);
                                }}
                                className="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                                title="Permanently retire terminal"
                              >
                                <PowerOff className="w-3 h-3" />
                                <span>Decommission</span>
                              </button>
                            )}

                            {/* Model B Key Rotation: STRICTLY LOCAL-ONLY */}
                            {dev.status !== 'DECOMMISSIONED' && canEnroll && (
                              isCurrent ? (
                                <button
                                  onClick={() => {
                                    setRotateKeyTarget(dev);
                                    setRotateName(`${dev.device_name} (Rotated)`);
                                    setRotateBranchId(dev.branch_id);
                                    setRotatePlatform(dev.platform);
                                  }}
                                  className="px-2 py-1 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 text-[11px] font-medium flex items-center gap-1 transition cursor-pointer"
                                  title="Model B: Retire and re-enroll with fresh key pair on this terminal"
                                >
                                  <Key className="w-3 h-3" />
                                  <span>Rotate Key</span>
                                </button>
                              ) : (
                                <span
                                  className="px-2 py-0.5 rounded bg-slate-800/40 text-slate-500 border border-slate-700/30 text-[10px] font-mono cursor-not-allowed"
                                  title="Model B Key Rotation is restricted to the physical workstation hosting this terminal's private key"
                                >
                                  Local Only
                                </span>
                              )
                            )}

                            {/* DECOMMISSIONED: Permanently retired label */}
                            {dev.status === 'DECOMMISSIONED' && (
                              <span className="text-[11px] text-slate-500 font-mono italic">
                                Retired
                              </span>
                            )}

                            {/* OWNER DELETE */}
                            {canDelete && (
                              <button
                                onClick={() => setDeleteTarget(dev)}
                                className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition cursor-pointer"
                                title="Delete device record (OWNER only)"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. MODALS */}

      {/* 5.1 Enrollment Modal */}
      {enrollmentAllowed && isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-teal-400" />
                <h3 className="text-base font-bold text-white">Enroll POS Terminal</h3>
              </div>
              <button
                onClick={() => setIsEnrollModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Device Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Counter 1 POS Workstation"
                  value={enrollName}
                  onChange={(e) => setEnrollName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                  maxLength={64}
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Assigned Branch *
                </label>
                <select
                  value={enrollBranchId}
                  onChange={(e) => setEnrollBranchId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                  required
                >
                  <option value="">Select branch...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.is_main ? '(Main Branch)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Terminal Platform
                </label>
                <select
                  value={enrollPlatform}
                  onChange={(e) => setEnrollPlatform(e.target.value as DevicePlatform)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="WEB">Web Browser (PWA / Chrome)</option>
                  <option value="WINDOWS">Windows Desktop</option>
                  <option value="ANDROID">Android POS Terminal</option>
                  <option value="IOS">iOS Tablet</option>
                </select>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enrollIsThisWorkstation}
                    onChange={(e) => setEnrollIsThisWorkstation(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-teal-600 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200 block">
                      Enroll this workstation as the terminal
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Generates non-extractable NIST P-256 keys locally in IndexedDB.
                      Private keys never leave this browser.
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEnrollModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEnrolling}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center gap-1.5 shadow-lg transition"
                >
                  {isEnrolling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating Keys...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Enrollment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5.2 Decommission Modal (With Local Safety Check & Remote Warnings) */}
      {decommissionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400">
                <PowerOff className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Decommission Terminal</h3>
              </div>
              <button
                onClick={() => setDecommissionTarget(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                You are about to permanently decommission terminal{' '}
                <strong className="text-white">{decommissionTarget.device_name}</strong>.
              </p>

              {/* LOCAL TERMINAL SAFETY EVALUATION */}
              {isDecommissionTargetCurrent ? (
                <>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-slate-400 font-semibold mb-1">
                      Local Offline Queue Inspection:
                    </div>
                    {(currentTerminal?.pendingOfflineCount || 0) > 0 ? (
                      <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5 text-rose-400">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>DECOMMISSION BLOCKED BY SAFETY INVARIANT</span>
                        </div>
                        <p className="leading-relaxed">
                          This local terminal has{' '}
                          <strong>{currentTerminal?.pendingOfflineCount}</strong> unsynchronized
                          offline transaction(s).
                        </p>
                        <p className="text-[11px] text-rose-300/80">
                          To maintain financial integrity, local transactions must be synchronized to
                          PostgreSQL before decommissioning. Connect to network and drain queue.
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Local queue is clear (0 pending operations). Decommission permitted.</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* REMOTE TERMINAL NOTICE */
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Remote Terminal Warning</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    The server cannot inspect remote IndexedDB stores. If this terminal has
                    unsynchronized offline transactions, decommissioning will permanently prevent
                    those transactions from syncing.
                  </p>
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmedRemoteNotice}
                      onChange={(e) => setConfirmedRemoteNotice(e.target.checked)}
                      className="mt-0.5 rounded border-amber-500/40 text-amber-500 focus:ring-0"
                    />
                    <span className="text-[11px] text-slate-200">
                      I acknowledge that unsynchronized transactions on this remote terminal may be
                      permanently stranded.
                    </span>
                  </label>
                </div>
              )}

              <div className="p-2.5 rounded-lg bg-slate-950 text-slate-400 text-[11px] border border-slate-800">
                <strong>Irreversibility Rule:</strong> Decommissioned device identities cannot be reactivated.
                To reuse physical hardware, follow Model B Retire + Re-Enroll.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDecommissionTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecommissionConfirm}
                disabled={
                  (isDecommissionTargetCurrent && (currentTerminal?.pendingOfflineCount || 0) > 0) ||
                  (!isDecommissionTargetCurrent && !confirmedRemoteNotice)
                }
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-600/20 transition cursor-pointer"
              >
                <PowerOff className="w-3.5 h-3.5" />
                <span>Confirm Decommission</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5.3 Model B Key Rotation Modal */}
      {enrollmentAllowed && rotateKeyTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sky-400">
                <Key className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Model B Key Rotation</h3>
              </div>
              <button
                onClick={() => setRotateKeyTarget(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRotateKeyConfirm} className="space-y-4 text-xs">
              <p className="text-slate-300">
                Rotating keys for <strong className="text-white">{rotateKeyTarget.device_name}</strong>.
                Old device identity will be retired (DECOMMISSIONED) and a brand new P-256 key pair
                will be enrolled.
              </p>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  New Terminal Name *
                </label>
                <input
                  type="text"
                  value={rotateName}
                  onChange={(e) => setRotateName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-sky-500"
                  required
                />
              </div>

              {/* LOCAL QUEUE SAFETY INSPECTION IN ROTATION MODAL */}
              {(currentTerminal?.pendingOfflineCount || 0) > 0 ? (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-rose-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>ROTATION BLOCKED BY SAFETY INVARIANT</span>
                  </div>
                  <p className="leading-relaxed">
                    This terminal has <strong>{currentTerminal?.pendingOfflineCount}</strong> unsynchronized
                    offline operation(s).
                  </p>
                  <p className="text-[11px] text-rose-300/80">
                    Model B key rotation retires the old device identity. To prevent stranding transactions,
                    all queued operations must synchronize before retirement. Connect to network and drain queue.
                  </p>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Local queue clear (0 pending operations). Model B rotation permitted.</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setRotateKeyTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRotating || (currentTerminal?.pendingOfflineCount || 0) > 0}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold flex items-center gap-1.5 shadow-lg transition cursor-pointer"
                >
                  {isRotating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Rotating Keys...</span>
                    </>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      <span>Rotate & Re-Enroll</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5.4 Delete Device Modal (OWNER ONLY) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-rose-400">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Delete Device Record</h3>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Permanently delete device record <strong className="text-white">{deleteTarget.device_name}</strong> from
              the database? This is governed strictly by OWNER RLS.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold transition cursor-pointer"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
