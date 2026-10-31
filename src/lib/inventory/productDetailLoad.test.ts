import {
  ProductDetailLoadBinding,
  ProductDetailLoadCoordinator,
  runProductDetailLoad,
} from './productDetailLoad';

interface TestBatch {
  readonly id: string;
  readonly pharmacy_id: string;
  readonly product_id: string;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};

const PHARMACY_A = '11111111-1111-4111-8111-111111111111';
const PHARMACY_B = '22222222-2222-4222-8222-222222222222';
const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WORKSPACE_A = 'user-a:membership-a:v1:pharmacy-a:branch-a:OWNER';
const WORKSPACE_B = 'user-a:membership-a:v2:pharmacy-b:branch-b:OWNER';

const binding = (
  productId: string,
  workspaceKey = WORKSPACE_A,
  pharmacyId = PHARMACY_A,
): ProductDetailLoadBinding => ({ workspaceKey, pharmacyId, productId });

const batch = (id: string, productId: string, pharmacyId = PHARMACY_A): TestBatch => ({
  id,
  pharmacy_id: pharmacyId,
  product_id: productId,
});

interface ViewState {
  current: ProductDetailLoadBinding | null;
  loading: boolean;
  unavailable: boolean;
  batches: readonly TestBatch[];
}

const createHarness = () => {
  const coordinator = new ProductDetailLoadCoordinator();
  const state: ViewState = { current: null, loading: false, unavailable: false, batches: [] };
  const select = (next: ProductDetailLoadBinding, load: Deferred<readonly TestBatch[]>) => {
    state.current = next;
    state.batches = [];
    state.unavailable = false;
    return runProductDetailLoad({
      coordinator,
      binding: next,
      currentBinding: () => state.current,
      load: () => load.promise,
      publishLoading: (loading) => { state.loading = loading; },
      publishSuccess: (batches) => {
        state.batches = batches;
        state.unavailable = false;
      },
      publishUnavailable: () => {
        state.batches = [];
        state.unavailable = true;
      },
    });
  };
  const invalidate = () => {
    coordinator.invalidate();
    state.current = null;
    state.batches = [];
    state.unavailable = false;
    state.loading = false;
  };
  return { coordinator, state, select, invalidate };
};

// A resolves before B: stale A cannot publish or end B's loading state.
{
  const h = createHarness();
  const a = deferred<readonly TestBatch[]>();
  const b = deferred<readonly TestBatch[]>();
  const aRun = h.select(binding(PRODUCT_A), a);
  const bRun = h.select(binding(PRODUCT_B), b);
  a.resolve([batch('a-old', PRODUCT_A)]);
  assert(await aRun === 'superseded', 'older A success is classified as superseded');
  assert(h.state.loading && h.state.batches.length === 0 && !h.state.unavailable, 'stale A cannot end or alter current B loading');
  b.resolve([batch('b-current', PRODUCT_B)]);
  assert(await bRun === 'published', 'current B success publishes');
  assert(!h.state.loading && h.state.batches[0]?.product_id === PRODUCT_B, 'published batches belong to selected B and loading ends');
}

// B resolves before A: the late A response cannot replace B.
{
  const h = createHarness();
  const a = deferred<readonly TestBatch[]>();
  const b = deferred<readonly TestBatch[]>();
  const aRun = h.select(binding(PRODUCT_A), a);
  const bRun = h.select(binding(PRODUCT_B), b);
  b.resolve([batch('b-current', PRODUCT_B)]);
  await bRun;
  a.resolve([batch('a-late', PRODUCT_A)]);
  await aRun;
  assert(h.state.batches[0]?.id === 'b-current', 'late A success cannot replace already-published B');
  assert(!h.state.loading && !h.state.unavailable, 'late A finally cannot alter B ready state');
}

// A -> B -> A requires generation identity; the first A is still stale.
{
  const h = createHarness();
  const firstA = deferred<readonly TestBatch[]>();
  const b = deferred<readonly TestBatch[]>();
  const secondA = deferred<readonly TestBatch[]>();
  const firstRun = h.select(binding(PRODUCT_A), firstA);
  const bRun = h.select(binding(PRODUCT_B), b);
  const secondRun = h.select(binding(PRODUCT_A), secondA);
  firstA.resolve([batch('a-first', PRODUCT_A)]);
  b.resolve([batch('b-middle', PRODUCT_B)]);
  await Promise.all([firstRun, bRun]);
  assert(h.state.loading && h.state.batches.length === 0, 'old A and B cannot publish into the replacement A request');
  secondA.resolve([batch('a-second', PRODUCT_A)]);
  await secondRun;
  assert(h.state.batches[0]?.id === 'a-second' && !h.state.loading, 'newest A alone publishes and completes');
}

// A stale success cannot clear the unavailable result of current B.
{
  const h = createHarness();
  const a = deferred<readonly TestBatch[]>();
  const b = deferred<readonly TestBatch[]>();
  const aRun = h.select(binding(PRODUCT_A), a);
  const bRun = h.select(binding(PRODUCT_B), b);
  b.reject(new Error('synthetic current failure'));
  assert(await bRun === 'unavailable', 'current failure publishes unavailable');
  a.resolve([batch('a-stale', PRODUCT_A)]);
  await aRun;
  assert(h.state.unavailable && h.state.batches.length === 0, 'stale success cannot clear current unavailable evidence');
  assert(!h.state.loading, 'stale success finally cannot restart or alter completed failure state');
}

// A stale failure cannot replace the successful current B result.
{
  const h = createHarness();
  const a = deferred<readonly TestBatch[]>();
  const b = deferred<readonly TestBatch[]>();
  const aRun = h.select(binding(PRODUCT_A), a);
  const bRun = h.select(binding(PRODUCT_B), b);
  b.resolve([batch('b-success', PRODUCT_B)]);
  await bRun;
  a.reject(new Error('synthetic stale failure'));
  await aRun;
  assert(!h.state.unavailable && h.state.batches[0]?.id === 'b-success', 'stale failure cannot replace current success');
  assert(!h.state.loading, 'stale failure finally cannot alter current loading state');
}

// Close then reopen the same product: the closed request remains stale.
{
  const h = createHarness();
  const beforeClose = deferred<readonly TestBatch[]>();
  const afterOpen = deferred<readonly TestBatch[]>();
  const oldRun = h.select(binding(PRODUCT_A), beforeClose);
  h.invalidate();
  const newRun = h.select(binding(PRODUCT_A), afterOpen);
  beforeClose.resolve([batch('before-close', PRODUCT_A)]);
  await oldRun;
  assert(h.state.loading && h.state.batches.length === 0, 'close/reopen keeps the replacement request loading');
  afterOpen.resolve([batch('after-open', PRODUCT_A)]);
  await newRun;
  assert(h.state.batches[0]?.id === 'after-open', 'only reopened request publishes');
}

// A workspace change invalidates an otherwise matching product response.
{
  const h = createHarness();
  const old = deferred<readonly TestBatch[]>();
  const oldRun = h.select(binding(PRODUCT_A), old);
  h.coordinator.invalidate();
  h.state.current = binding(PRODUCT_A, WORKSPACE_B, PHARMACY_B);
  h.state.loading = false;
  old.resolve([batch('old-workspace', PRODUCT_A)]);
  await oldRun;
  assert(h.state.batches.length === 0 && !h.state.loading && !h.state.unavailable, 'workspace invalidation suppresses all old publications');
  assert(h.state.current?.workspaceKey === WORKSPACE_B, 'new coherent workspace remains current');
}

// Unmount disposal prevents every later publication.
{
  const h = createHarness();
  const pending = deferred<readonly TestBatch[]>();
  const run = h.select(binding(PRODUCT_A), pending);
  h.coordinator.dispose();
  h.state.current = null;
  h.state.loading = false;
  pending.reject(new Error('synthetic after unmount'));
  assert(await run === 'superseded', 'unmounted request is superseded');
  assert(!h.state.loading && !h.state.unavailable && h.state.batches.length === 0, 'unmount suppresses error and finally publication');
}

// Malformed product/batch association fails closed for the current request.
{
  const h = createHarness();
  const mismatched = deferred<readonly TestBatch[]>();
  const run = h.select(binding(PRODUCT_A), mismatched);
  mismatched.resolve([batch('wrong-product', PRODUCT_B)]);
  assert(await run === 'unavailable', 'cross-product batch evidence is unavailable');
  assert(h.state.unavailable && h.state.batches.length === 0 && !h.state.loading, 'association failure publishes no batches and completes loading');
}

// A valid current result is immutable at the orchestration boundary.
{
  const h = createHarness();
  const current = deferred<readonly TestBatch[]>();
  const run = h.select(binding(PRODUCT_A), current);
  current.resolve([batch('valid', PRODUCT_A)]);
  await run;
  assert(Object.isFrozen(h.state.batches), 'published batch collection is immutable');
  assert(h.state.batches.every((item) => item.product_id === PRODUCT_A && item.pharmacy_id === PHARMACY_A), 'every published batch matches current product and pharmacy');
}

console.log(`Product-detail publication regressions: ${passed} passed`);
