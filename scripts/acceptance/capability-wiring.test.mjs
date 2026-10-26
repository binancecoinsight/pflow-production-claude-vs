import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const shell = read('src/components/AuthenticatedShell.tsx');
for (const wiring of [
  'mutationsAllowed={subscriptionLifecycle.capabilities.mutateCustomers}',
  'mutationsAllowed={subscriptionLifecycle.capabilities.mutateSuppliers}',
  'openShiftAllowed={subscriptionLifecycle.capabilities.openCashShift}',
  'reconcileExistingShiftAllowed={subscriptionLifecycle.capabilities.reconcileExistingCashShift}',
  'enrollmentAllowed={subscriptionLifecycle.capabilities.enrollDevice}',
]) assert(shell.includes(wiring), `production shell wires ${wiring}`);

const customers = read('src/components/customers/CustomersView.tsx');
assert(customers.includes('if (!mutationsAllowed) return;') && customers.includes('mutationBoundaryRef.current.accepts'), 'customer handlers and delayed completions are capability guarded');
assert(customers.includes('mutationsAllowed && isCreateModalOpen'), 'customer modal closes at the capability boundary');

const suppliers = read('src/components/suppliers/SuppliersView.tsx');
const supplierModal = read('src/components/suppliers/SupplierModal.tsx');
assert(suppliers.includes('mutationsAllowed && isModalOpen') && suppliers.includes('mutationsAllowed && deletingSupplier'), 'supplier mutation modals are capability guarded');
assert(supplierModal.includes('mutationBoundaryRef.current.accepts'), 'supplier delayed create/update completion is guarded');

const cash = read('src/components/cash/CashReconciliationView.tsx');
assert(cash.includes('if (!openShiftAllowed || !mutationToken) return;'), 'new cash-shift opening is guarded');
assert(cash.includes('!reconcileExistingShiftAllowed || !activeSession'), 'closing requires a server-known active shift and explicit reconciliation capability');

const devices = read('src/components/devices/DeviceManagementView.tsx');
assert(devices.includes('enrollmentAllowed &&') && devices.includes('canBlock = role'), 'device enrollment is contained separately from security actions');
assert(devices.includes('enrollmentBoundaryRef.current.accepts'), 'delayed enrollment/key-replacement completion is capability guarded');

const pos = read('src/components/pos/PosView.tsx');
assert(pos.includes('runPosScopeBoundTask') && pos.includes('handleRetireRestrictedDraft'), 'restricted retirement uses the production scope-bound async adapter');

console.log('Capability production wiring static checks: passed');
