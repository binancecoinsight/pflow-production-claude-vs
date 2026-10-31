import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adjustInventoryStock,
  dispatchStockTransfer,
  receiveStockTransfer,
  submitStockIntake,
} from './service';

const id = {
  pharmacy: '11111111-1111-4111-8111-111111111111',
  branchA: '22222222-2222-4222-8222-222222222222',
  branchB: '33333333-3333-4333-8333-333333333333',
  product: '44444444-4444-4444-8444-444444444444',
  batch: '55555555-5555-4555-8555-555555555555',
  purchase: '66666666-6666-4666-8666-666666666666',
  adjustment: '77777777-7777-4777-8777-777777777777',
  transfer: '88888888-8888-4888-8888-888888888888',
  op: '99999999-9999-4999-8999-999999999999',
};
const timestamp = '2026-10-29T12:34:56.123456+00:00';

const intakeRequest = {
  pharmacy_id: id.pharmacy,
  branch_id: id.branchA,
  client_op_id: id.op,
  items: [{ product_id: id.product, batch_number: 'LOT-1', expiry_date: '2027-12-31', quantity: 2, cost_price: 700, selling_price: 1200 }],
};
const adjustmentRequest = {
  pharmacy_id: id.pharmacy,
  branch_id: id.branchA,
  product_id: id.product,
  batch_id: id.batch,
  direction: 'DECREASE' as const,
  quantity: 3,
  reason: 'COUNT_DISCREPANCY' as const,
  client_op_id: id.op,
};
const dispatchRequest = {
  pharmacy_id: id.pharmacy,
  source_branch_id: id.branchA,
  destination_branch_id: id.branchB,
  items: [{ product_id: id.product, source_batch_id: id.batch, quantity: 1 }],
  client_op_id: id.op,
};
const receiveRequest = {
  pharmacy_id: id.pharmacy,
  transfer_id: id.transfer,
  client_op_id: id.op,
};

const valid = {
  intake: { purchase_id: id.purchase, status: 'COMPLETED', total_items: 1, total_cost: 1400, processed_at: timestamp },
  adjustment: { adjustment_id: id.adjustment, batch_id: id.batch, previous_quantity: 10, adjustment_quantity: -3, resulting_quantity: 7, adjusted_at: timestamp },
  dispatch: { transfer_id: id.transfer, status: 'DISPATCHED', total_items: 1, dispatched_at: timestamp },
  receive: { transfer_id: id.transfer, status: 'RECEIVED', total_items: 1, received_at: timestamp },
};

type Operation = 'intake' | 'adjustment' | 'dispatch' | 'receive';
type RpcResponse = { data: unknown; error: { message?: string } | null };

function injectedClient(response: RpcResponse, counters: { rpc: number; refresh: number }): SupabaseClient {
  return {
    rpc: async () => { counters.rpc += 1; return response; },
    auth: {
      getSession: async () => {
        counters.refresh += 1;
        return { data: { session: null }, error: null };
      },
    },
    from: () => { throw new Error('refresh query must not start for rejected response evidence'); },
  } as unknown as SupabaseClient;
}

async function invoke(operation: Operation, response: RpcResponse, skipRefresh: boolean) {
  const counters = { rpc: 0, refresh: 0 };
  const customClient = injectedClient(response, counters);
  const options = { customClient, skipRefresh };
  const result = operation === 'intake'
    ? await submitStockIntake(intakeRequest, options)
    : operation === 'adjustment'
    ? await adjustInventoryStock(adjustmentRequest, options)
    : operation === 'dispatch'
    ? await dispatchStockTransfer(dispatchRequest, options)
    : await receiveStockTransfer(receiveRequest, options);
  return { result, counters };
}

async function run() {
  let passed = 0;
  let failed = 0;
  const check = (condition: boolean, label: string) => {
    if (condition) { passed += 1; console.log(`  ✓ ${label}`); }
    else { failed += 1; console.error(`  ✗ ${label}`); }
  };
  const accept = async (operation: Operation, row: unknown, label: string) => {
    const first = await invoke(operation, { data: [row], error: null }, true);
    const replay = await invoke(operation, { data: [row], error: null }, true);
    check(first.result.success === true, `${label}: normal/specified success accepted`);
    check(replay.result.success === true && JSON.stringify(replay.result) === JSON.stringify(first.result), `${label}: exact replay preserves the same result`);
    check(first.counters.rpc === 1 && replay.counters.rpc === 1, `${label}: each attempt invokes exactly one RPC`);
  };
  const reject = async (operation: Operation, data: unknown, label: string) => {
    const observed = await invoke(operation, { data, error: null }, false);
    check(observed.result.success === false && observed.result.errorCode === 'UNEXPECTED_RESPONSE', `${label}: malformed success evidence is explicitly rejected`);
    check(observed.counters.rpc === 1 && observed.counters.refresh === 0, `${label}: rejection occurs before refresh/publication`);
  };
  const fail = async (operation: Operation, message: string, expectedCode: string, label: string) => {
    const observed = await invoke(operation, { data: null, error: { message } }, false);
    check(observed.result.success === false && observed.result.errorCode === expectedCode, `${label}: RPC failure remains a typed failure`);
    check(observed.counters.refresh === 0, `${label}: RPC failure cannot refresh or publish success`);
  };

  console.log('--- MVP-02-CLOSE INVENTORY MUTATION RESPONSE CONTRACTS ---');

  await accept('intake', valid.intake, 'intake COMPLETED terminal result');
  await accept('adjustment', valid.adjustment, 'immutable adjustment result');
  await accept('dispatch', valid.dispatch, 'dispatch DISPATCHED result');
  await accept('receive', valid.receive, 'receive RECEIVED terminal result');

  const advancedDispatch = { ...valid.dispatch, status: 'RECEIVED' };
  const advanced = await invoke('dispatch', { data: [advancedDispatch], error: null }, true);
  check(advanced.result.success === true && 'status' in advanced.result && advanced.result.status === 'RECEIVED', 'dispatch exact replay remains valid after transfer lifecycle advances to RECEIVED');

  await fail('intake', 'IDEMPOTENCY_CONFLICT: divergent receipt', 'IDEMPOTENCY_CONFLICT', 'intake conflict');
  await fail('adjustment', 'IDEMPOTENCY_CONFLICT: divergent adjustment', 'IDEMPOTENCY_CONFLICT', 'adjustment conflict');
  await fail('dispatch', 'IDEMPOTENCY_CONFLICT: divergent dispatch', 'IDEMPOTENCY_CONFLICT', 'dispatch conflict');
  await fail('receive', 'TRANSFER_ALREADY_RECEIVED: another operation received it', 'TRANSFER_ALREADY_RECEIVED', 'receive non-replay terminal conflict');

  for (const operation of ['intake', 'adjustment', 'dispatch', 'receive'] as const) {
    await reject(operation, null, `${operation} null response`);
    await reject(operation, [], `${operation} missing row`);
    await reject(operation, [{}], `${operation} missing fields`);
    await reject(operation, [valid[operation], valid[operation]], `${operation} multiple rows`);
  }

  const alternateIntake = await invoke('intake', { data: [{ ...valid.intake, purchase_id: id.transfer }], error: null }, true);
  check(alternateIntake.result.success === true, 'intake does not invent a request-to-server-generated purchase identity relationship');
  await reject('intake', [{ ...valid.intake, purchase_id: 'not-a-uuid' }], 'intake invalid purchase identity');
  await reject('intake', [{ ...valid.intake, status: 'PENDING' }], 'intake invalid nonterminal status');
  await reject('intake', [{ ...valid.intake, total_items: 2 }], 'intake contract-inconsistent item count');
  await reject('intake', [{ ...valid.intake, total_cost: 1399 }], 'intake contract-inconsistent cost arithmetic');
  await reject('intake', [{ ...valid.intake, total_cost: Number.MAX_SAFE_INTEGER + 1 }], 'intake unsafe total cost');
  await reject('intake', [{ ...valid.intake, processed_at: '2026-10-29 12:34:56' }], 'intake ambiguous timestamp');
  await reject('intake', [{ ...valid.intake, processed_at: '2026-02-30T12:00:00Z' }], 'intake invalid Gregorian timestamp');

  await reject('adjustment', [{ ...valid.adjustment, adjustment_id: 'not-a-uuid' }], 'adjustment invalid identity');
  await reject('adjustment', [{ ...valid.adjustment, batch_id: id.purchase }], 'adjustment wrong request association');
  await reject('adjustment', [{ ...valid.adjustment, adjustment_quantity: 3, resulting_quantity: 13 }], 'adjustment wrong signed delta');
  await reject('adjustment', [{ ...valid.adjustment, resulting_quantity: 8 }], 'adjustment inconsistent arithmetic');
  await reject('adjustment', [{ ...valid.adjustment, previous_quantity: Number.MAX_SAFE_INTEGER + 1 }], 'adjustment unsafe quantity');
  await reject('adjustment', [{ ...valid.adjustment, adjusted_at: 'October 29, 2026' }], 'adjustment ambiguous timestamp');

  await reject('dispatch', [{ ...valid.dispatch, transfer_id: 'not-a-uuid' }], 'dispatch invalid transfer identity');
  const alternateDispatch = await invoke('dispatch', { data: [{ ...valid.dispatch, transfer_id: id.purchase }], error: null }, true);
  check(alternateDispatch.result.success === true, 'dispatch does not invent a request-to-server-generated transfer identity relationship');
  await reject('dispatch', [{ ...valid.dispatch, status: 'CANCELLED' }], 'dispatch invalid status');
  await reject('dispatch', [{ ...valid.dispatch, total_items: 2 }], 'dispatch inconsistent item count');
  await reject('dispatch', [{ ...valid.dispatch, total_items: Number.MAX_SAFE_INTEGER + 1 }], 'dispatch unsafe item count');
  await reject('dispatch', [{ ...valid.dispatch, dispatched_at: '2026-13-01T00:00:00Z' }], 'dispatch invalid timestamp');

  await reject('receive', [{ ...valid.receive, transfer_id: id.purchase }], 'receive wrong transfer identity');
  await reject('receive', [{ ...valid.receive, status: 'DISPATCHED' }], 'receive invalid nonterminal status');
  await reject('receive', [{ ...valid.receive, total_items: 0 }], 'receive impossible empty transfer count');
  await reject('receive', [{ ...valid.receive, total_items: Number.MAX_SAFE_INTEGER + 1 }], 'receive unsafe item count');
  await reject('receive', [{ ...valid.receive, received_at: '2026-10-29T24:00:00Z' }], 'receive invalid timestamp');

  console.log(`\nInventory mutation response contracts: ${passed} passed, ${failed} failed, ${passed + failed} total.`);
  if (failed) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
