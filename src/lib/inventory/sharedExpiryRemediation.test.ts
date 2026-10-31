import {
  InvalidInventoryDateError,
  computeExpiryInfo,
  parseExpiryDateUtcMidnight,
  parseUtcMidnight,
} from './expiry';
import { selectRecommendedBatch } from './service';
import { validateBatchRecord, validateStockIntakeItem } from './validation';
import { LocalBatch } from './types';

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const rejectsDate = (action: () => unknown): boolean => {
  try {
    action();
    return false;
  } catch (error: unknown) {
    return error instanceof InvalidInventoryDateError;
  }
};

const DAY = 86_400_000;
assert(parseExpiryDateUtcMidnight('2024-02-29') === Date.UTC(2024, 1, 29), 'valid leap day is accepted');
assert(parseExpiryDateUtcMidnight('2000-02-29') === Date.UTC(2000, 1, 29), '400-year leap day is accepted');
for (const value of ['1900-02-29', '2023-02-29', '2026-02-30', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-01T00:00:00Z', '2026-01-01junk', ' 2026-01-01']) {
  assert(rejectsDate(() => parseExpiryDateUtcMidnight(value)), `invalid exact batch date is rejected: ${value}`);
}

assert(parseUtcMidnight(0) === 0, 'epoch zero remains epoch zero rather than substituting now');
assert(parseUtcMidnight(new Date(0)) === 0, 'valid Date at epoch zero is accepted');
assert(parseUtcMidnight('1970-01-01') === 0, 'exact reference date-only is UTC midnight');
assert(parseUtcMidnight('2026-10-28T00:30:00+01:00') === Date.UTC(2026, 9, 27), 'positive offset crossing converts to actual prior UTC day');
assert(parseUtcMidnight('2026-10-27T23:30:00-01:00') === Date.UTC(2026, 9, 28), 'negative offset crossing converts to actual next UTC day');
assert(parseUtcMidnight('2026-10-28t12:30:45.123456z') === Date.UTC(2026, 9, 28), 'strict RFC3339 timestamp accepts fraction and explicit UTC timezone');
for (const value of [new Date(Number.NaN), Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 8_640_000_000_000_001, -8_640_000_000_000_001, '10/28/2026', '2026-10-28T12:00:00', '2026-02-30T12:00:00Z', '2026-10-28T24:00:00Z', '2026-10-28T12:60:00Z', '2026-10-28T12:00:60Z']) {
  assert(rejectsDate(() => parseUtcMidnight(value as Date | string | number)), `invalid or ambiguous reference is rejected: ${String(value)}`);
}
assert(Number.isFinite(parseUtcMidnight(8_640_000_000_000_000)), 'maximum supported epoch is accepted');
assert(Number.isFinite(parseUtcMidnight(-8_640_000_000_000_000)), 'minimum supported epoch is accepted');

const sameDay = computeExpiryInfo('2026-10-28', '2026-10-28T23:59:59-03:00');
assert(sameDay.is_expired && sameDay.days_until_expiry === -1, 'timestamp policy uses actual UTC day across offset crossing');
const sameUtcDay = computeExpiryInfo('2026-10-28', '2026-10-28T01:00:00Z');
assert(sameUtcDay.is_expired && sameUtcDay.days_until_expiry === 0, 'same UTC calendar day remains expired');
assert(computeExpiryInfo('1970-01-02', 0).days_until_expiry === 1, 'epoch-zero reference preserves next-day calculation');
assert(parseExpiryDateUtcMidnight('2026-10-29') - parseExpiryDateUtcMidnight('2026-10-28') === DAY, 'valid date ordering remains one UTC day apart');

const PHARMACY = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333';
const batch = (id: string, expiryDate: string, stock: number): LocalBatch => ({
  id,
  pharmacy_id: PHARMACY,
  product_id: PRODUCT,
  branch_id: BRANCH,
  batch_number: id,
  expiry_date: expiryDate,
  projected_stock: stock,
  selling_price: 100,
  cost_price: 50,
  status: 'ACTIVE',
  source_updated_at: null,
  synced_at: 1,
  read_model_version: 1,
});
const early = batch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026-11-01', 1);
const late = batch('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '2026-12-01', 100);
assert(selectRecommendedBatch([late, early], { referenceDate: '2026-10-28' })?.id === early.id, 'valid FEFO ordering is unchanged');
const malformed = batch('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '2026-02-30', 999);
assert(rejectsDate(() => selectRecommendedBatch([early, malformed], { referenceDate: '2026-10-28' })), 'one malformed candidate blocks the complete recommendation rather than choosing another');
assert(rejectsDate(() => selectRecommendedBatch([], { referenceDate: Number.NaN })), 'invalid reference fails even for an empty candidate set');

const rawBatch = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', pharmacy_id: PHARMACY, product_id: PRODUCT,
  branch_id: BRANCH, batch_number: 'D', expiry_date: '2026-02-30', quantity: 1,
};
assert(!validateBatchRecord(rawBatch, PHARMACY, 1).isValid, 'snapshot batch validation rejects impossible date before ingestion');
assert(!validateBatchRecord({ ...rawBatch, expiry_date: '2026-10-28T00:00:00Z' }, PHARMACY, 1).isValid, 'snapshot validation rejects date prefixes and suffixes');
const intakeBase = { product_id: PRODUCT, batch_number: 'D', expiry_date: '2026-10-28', quantity: 1, cost_price: 1, selling_price: 2 };
assert(validateStockIntakeItem(intakeBase).isValid, 'valid intake date remains accepted');
assert(!validateStockIntakeItem({ ...intakeBase, expiry_date: '2026-02-30' }).isValid, 'intake validation rejects impossible date before dispatch');
assert(!validateStockIntakeItem({ ...intakeBase, expiry_date: '2026-10-28 ' }).isValid, 'intake validation rejects trailing whitespace rather than normalizing');

console.log(`sharedExpiryRemediation.test.ts: ${passed} assertions passed`);
