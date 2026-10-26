import type { Subscription } from '../../types/database';
import { resolveSubscriptionLifecycle } from './lifecycle';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  passed += 1;
}

const base: Subscription = {
  id: 'sub-1', pharmacy_id: 'pharmacy-1', plan_code: 'STARTER', status: 'TRIAL',
  current_period_start: '2026-10-01T00:00:00.000Z', current_period_end: '2026-10-15T00:00:00.000Z',
  created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
};

assert(resolveSubscriptionLifecycle(base, new Date('2026-10-14T23:59:59.999Z')).state === 'TRIAL', 'trial remains active before its UTC end');
assert(resolveSubscriptionLifecycle(base, new Date('2026-10-15T00:00:00.000Z')).state === 'GRACE', 'grace begins at the UTC period boundary');
assert(resolveSubscriptionLifecycle(base, new Date('2026-10-21T23:59:59.999Z')).state === 'GRACE', 'grace remains active before seven days elapse');
assert(resolveSubscriptionLifecycle(base, new Date('2026-10-22T00:00:00.000Z')).state === 'EXPIRED', 'grace ends at the exact seven-day UTC boundary');
assert(resolveSubscriptionLifecycle({ ...base, status: 'ACTIVE' }, new Date('2026-10-10T00:00:00.000Z')).state === 'ACTIVE', 'paid subscription is active within period');
assert(resolveSubscriptionLifecycle({ ...base, status: 'PAST_DUE' }, new Date('2026-10-20T00:00:00.000Z')).state === 'GRACE', 'past-due record maps to bounded grace');
assert(!resolveSubscriptionLifecycle({ ...base, status: 'CANCELLED' }, new Date('2026-10-10T00:00:00.000Z')).mutationAllowed, 'cancelled record fails closed for new mutations');
assert(!resolveSubscriptionLifecycle(null).mutationAllowed, 'missing evidence fails closed for new mutations');
assert(resolveSubscriptionLifecycle(null).historicalReadAllowed, 'missing evidence does not hide authorized historical reads');
assert(resolveSubscriptionLifecycle(base).authoritative === false, 'client lifecycle calculation is explicitly advisory');
const expired = resolveSubscriptionLifecycle(base, new Date('2026-10-22T00:00:00.000Z'));
assert(!expired.capabilities.createSale && !expired.capabilities.mutateInventory && !expired.capabilities.createRefundOrRestock, 'expired capability map blocks new financial and inventory mutations');
assert(!expired.capabilities.mutateCustomers && !expired.capabilities.mutateSuppliers && !expired.capabilities.openCashShift && !expired.capabilities.enrollDevice, 'expired capability map blocks new directory, shift-opening and enrollment mutations');
assert(expired.capabilities.viewHistoricalRecords && expired.capabilities.reviewDurableCheckout && expired.capabilities.acknowledgeDurableCheckout, 'expired capability map preserves history and durable checkout review/acknowledgment');
assert(expired.capabilities.reconcilePreviouslyAcceptedOperations && expired.capabilities.refreshReadModels, 'expired capability map preserves reconciliation and read-model refresh');
assert(expired.capabilities.reconcileExistingCashShift && expired.capabilities.manageDeviceSecurity, 'expired capability map preserves existing-shift reconciliation and device security/recovery actions');

console.log(`Subscription lifecycle tests: ${passed} passed`);
