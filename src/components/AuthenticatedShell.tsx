import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Building2, 
  MapPin, 
  ShieldCheck, 
  LogOut, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  User as UserIcon,
  CreditCard,
  Key,
  ChevronDown,
  ShoppingBag,
  LayoutDashboard,
  Package,
  Receipt,
  Users,
  Coins,
  Truck,
  BarChart3,
  Laptop
} from 'lucide-react';
import { PosView } from './pos/PosView';
import { InventoryView } from './inventory/InventoryView';
import { SalesView } from './sales/SalesView';
import { CustomersView } from './customers/CustomersView';
import { CashReconciliationView } from './cash/CashReconciliationView';
import { SuppliersView } from './suppliers/SuppliersView';
import { ReportsView } from './reports/ReportsView';
import { DeviceManagementView } from './devices/DeviceManagementView';

export const AuthenticatedShell: React.FC = () => {
  const { 
    user, 
    profile, 
    memberships,
    pharmacy, 
    branch, 
    role, 
    permissions, 
    subscription, 
    selectPharmacy, 
    signOut 
  } = useAuth();

  const [switcherOpen, setSwitcherOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'pos' | 'inventory' | 'sales' | 'customers' | 'suppliers' | 'reconciliation' | 'reports' | 'devices' | 'overview'>('pos');

  const canViewReports = role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST' || permissions.includes('reports.read');

  const getRoleBadgeColor = (r: string | null) => {
    switch (r) {
      case 'OWNER':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'MANAGER':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'PHARMACIST':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'CASHIER':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const getSubBadgeColor = (s: string | undefined) => {
    switch (s) {
      case 'ACTIVE':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'TRIAL':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'PAST_DUE':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'CANCELLED':
      case 'EXPIRED':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md sticky top-0 z-50 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-bold text-base">
            P
          </div>
          <div>
            <div className="flex items-center gap-2 relative">
              <span className="font-bold tracking-tight text-white text-base">
                {pharmacy?.name || 'PharmacyFlow'}
              </span>
              <span className="px-2 py-0.5 text-xs font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                {pharmacy?.currency || 'NGN'}
              </span>

              {/* Multi-Pharmacy Tenant Switcher */}
              {memberships.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setSwitcherOpen(!switcherOpen)}
                    className="p-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 border border-slate-700 transition"
                    title="Switch Pharmacy Tenant"
                  >
                    <span className="text-[10px] font-medium text-emerald-400">Switch</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {switcherOpen && (
                    <div className="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50">
                      <div className="text-[11px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                        Switch Workspace ({memberships.length})
                      </div>
                      <div className="space-y-1 mt-1">
                        {memberships.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              selectPharmacy(m.pharmacy_id);
                              setSwitcherOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                              m.pharmacy_id === pharmacy?.id
                                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                : 'hover:bg-slate-800 text-slate-300'
                            }`}
                          >
                            <span className="font-medium truncate">{m.pharmacy?.name}</span>
                            <span className="text-[10px] font-mono px-1 rounded bg-slate-950 text-slate-400">
                              {m.role}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {branch && (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <MapPin className="w-3 h-3 text-slate-500" />
                <span>{branch.name}</span>
                {branch.is_main && (
                  <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400">Main</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Point of Sale</span>
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Inventory</span>
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'sales'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Sales History</span>
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'customers'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Customers</span>
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'suppliers'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Suppliers</span>
          </button>
          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'reconciliation'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>Cash & Shifts</span>
          </button>
          {canViewReports && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Reports</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('devices')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'devices'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Devices & POS</span>
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Workspace Overview</span>
          </button>
        </div>

        {/* User Context & Sign Out */}
        <div className="flex items-center gap-3">
          {/* Authoritative Role Badge */}
          <div className={`px-2.5 py-1 rounded-lg text-xs font-bold border tracking-wider flex items-center gap-1.5 ${getRoleBadgeColor(role)}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{role || 'MEMBER'}</span>
          </div>

          {/* User Details */}
          <div className="hidden sm:block text-right">
            <div className="text-xs font-semibold text-white">
              {profile?.full_name || 'Staff Member'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {user?.email}
            </div>
          </div>

          <button
            onClick={() => signOut()}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'pos' ? (
          <PosView />
        ) : activeTab === 'inventory' ? (
          <InventoryView />
        ) : activeTab === 'sales' ? (
          <SalesView />
        ) : activeTab === 'customers' ? (
          <CustomersView />
        ) : activeTab === 'suppliers' ? (
          <SuppliersView />
        ) : activeTab === 'reconciliation' ? (
          <CashReconciliationView />
        ) : activeTab === 'reports' ? (
          <ReportsView />
        ) : activeTab === 'devices' ? (
          <DeviceManagementView />
        ) : (
          <>
            {/* Welcome Banner */}
            <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-slate-900/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-2">
                  <CheckCircle className="w-3 h-3" />
                  Authenticated Multi-Tenant Session Verified
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  Welcome, {profile?.full_name || user?.email}
                </h1>
                <p className="text-sm text-slate-400 mt-1 max-w-xl">
                  Currently operating workspace <strong className="text-white">{pharmacy?.name}</strong>. 
                  Governed strictly by PostgreSQL Row Level Security policies M-1 through M-7.
                </p>
              </div>

              {/* Subscription State Badge */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col justify-center min-w-[200px]">
                <div className="text-xs text-slate-400 flex items-center justify-between mb-1">
                  <span>Subscription Tier:</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${getSubBadgeColor(subscription?.status)}`}>
                    {subscription?.status || 'TRIAL'}
                  </span>
                </div>
                <div className="text-sm font-semibold text-white capitalize">
                  {subscription?.plan_code || 'Starter Plan'}
                </div>
                {subscription?.current_period_end && (
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3" />
                    <span>Renews: {new Date(subscription.current_period_end).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Session Metadata Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Card 1: Identity & Account */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  <UserIcon className="w-4 h-4 text-emerald-400" />
                  <span>Identity Anchor</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">User ID:</span>
                    <span className="font-mono text-slate-300 text-[11px] truncate max-w-[170px]" title={user?.id}>
                      {user?.id}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Email:</span>
                    <span className="font-mono text-slate-300">{user?.email}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Profile Name:</span>
                    <span className="text-slate-300">{profile?.full_name || 'Not specified'}</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Tenancy & Branch */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  <Building2 className="w-4 h-4 text-sky-400" />
                  <span>Selected Tenant</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Pharmacy ID:</span>
                    <span className="font-mono text-slate-300 text-[11px] truncate max-w-[170px]" title={pharmacy?.id}>
                      {pharmacy?.id}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Store Name:</span>
                    <span className="text-slate-300 font-medium">{pharmacy?.name}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Assigned Branch:</span>
                    <span className="text-slate-300">{branch?.name || 'Main Branch'}</span>
                  </div>
                </div>
              </div>

              {/* Card 3: Security & Billing Context */}
              <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  <CreditCard className="w-4 h-4 text-purple-400" />
                  <span>Subscription & Role</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Plan Code:</span>
                    <span className="font-mono text-slate-300 uppercase">{subscription?.plan_code || 'STARTER'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Role Authority:</span>
                    <span className="font-bold text-emerald-400">{role}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Permissions Count:</span>
                    <span className="font-mono text-slate-300 font-semibold">{permissions.length} active</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resolved Permissions Card */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Authoritative Role Permissions (Database Resolved)</h2>
                </div>
                <span className="text-xs text-slate-500 font-mono">public.role_permissions</span>
              </div>

              {permissions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {permissions.map((perm) => (
                    <span
                      key={perm}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No explicit permissions mapped to this role in role_permissions table.</p>
              )}
            </div>

            {/* Status Notice */}
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-teal-400" />
                <span>PharmacyFlow Offline POS Engine & Multi-Tenant Session Active.</span>
              </div>
              <span className="font-mono text-emerald-400 text-[11px]">Phase 5D-6 Active</span>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-500">
        PharmacyFlow • Multi-Tenant Pharmacy Session Active • Database RLS Enforced
      </footer>
    </div>
  );
};
