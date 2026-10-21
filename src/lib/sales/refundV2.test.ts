import { calculateRefundV2, REFUND_V2_MAX_MINOR } from './refundV2';
import { HistoricalSale } from './history';

const sale: HistoricalSale = {
  id: 'sale', pharmacy_id: 'pharmacy', branch_id: 'branch', cashier_id: 'cashier', customer_id: null,
  currency: 'NGN', subtotal: 4000, discount: 101, tax: 5, total: 3904, payment_method: 'CASH',
  created_at: '', provenance: 'SERVER_COMMITTED', sync_status: 'COMMITTED',
  line_items: [
    { id: 'a', product_id: 'p1', batch_id: 'b1', quantity: 3, unit_price: 1000, discount: 0, tax: 0, line_total: 3000 },
    { id: 'b', product_id: 'p2', batch_id: 'b2', quantity: 1, unit_price: 1000, discount: 0, tax: 0, line_total: 1000 }
  ]
};
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
const throws = (run: () => unknown, message: string) => {
  try { run(); } catch { return; }
  throw new Error(message);
};
const full = calculateRefundV2(sale, [
  { sale_item_id: 'a', product_id: 'p1', batch_id: 'b1', quantity: 3 },
  { sale_item_id: 'b', product_id: 'p2', batch_id: 'b2', quantity: 1 }
]);
assert(full.total_minor === 3904, 'full return must equal authoritative sale total');
const first = calculateRefundV2(sale, [{ sale_item_id: 'a', product_id: 'p1', batch_id: 'b1', quantity: 1 }]);
const second = calculateRefundV2(sale, [{ sale_item_id: 'a', product_id: 'p1', batch_id: 'b1', quantity: 2 }], new Map([['a', 1]]));
assert(first.total_minor + second.total_minor === full.lines.find((line) => line.sale_item_id === 'a')!.refund_minor, 'cumulative rounding must conserve entitlement');
throws(() => calculateRefundV2({ ...sale, currency: 'EUR' }, [{ sale_item_id: 'a', product_id: 'p1', batch_id: 'b1', quantity: 1 }]), 'unsupported currency must fail');
throws(() => calculateRefundV2(sale, [{ sale_item_id: 'a', product_id: 'p1', batch_id: 'b1', quantity: 1 }, { sale_item_id: 'a', product_id: 'p1', batch_id: 'b1', quantity: 1 }]), 'duplicate sale item must fail');
throws(() => calculateRefundV2(sale, [{ sale_item_id: 'a', product_id: 'p1', batch_id: 'b1', quantity: 4 }]), 'over-return must fail');
assert(REFUND_V2_MAX_MINOR === 9_999_999_999, 'minor-unit maximum matches NUMERIC compatibility cap');
console.log('refundV2 tests: 7 passed');
