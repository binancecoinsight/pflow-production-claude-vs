import { WorkspaceRequestGuard } from './membershipWorkspace';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
};

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
type PublicationKind = 'authenticated_ready' | 'authenticated_select_branch' | 'authenticated_no_branches' | 'authenticated_no_membership';

const runMicrotaskRace = async (
  kind: PublicationKind,
  invalidate: (guard: WorkspaceRequestGuard, setUser: (userId: string | null) => void) => void,
): Promise<{ states: string[]; preferences: string[]; publications: string[] }> => {
  const guard = new WorkspaceRequestGuard();
  let currentUserId: string | null = USER_A;
  const load = deferred<string>();
  const token = guard.begin(USER_A);
  const states: string[] = [];
  const preferences: string[] = [];
  const publications: string[] = [];

  const guardedResult = guard.waitForCurrent(token, () => currentUserId, () => load.promise);
  // Registered before the awaiting caller's continuation. The helper has
  // already classified its result as current when this microtask invalidates.
  const invalidation = guardedResult.then(() => {
    invalidate(guard, (userId) => { currentUserId = userId; });
  });
  const caller = (async () => {
    const result = await guardedResult;
    if (result.status !== 'current') return;
    guard.publishIfCurrent(token, () => currentUserId, () => {
      publications.push(result.value);
      states.push(kind);
      if (kind !== 'authenticated_no_membership') preferences.push('pharmacy-hint');
    });
  })();

  load.resolve(kind);
  await Promise.all([invalidation, caller]);
  return { states, preferences, publications };
};

const staleCases: Array<{
  kind: PublicationKind;
  label: string;
  invalidate: (guard: WorkspaceRequestGuard, setUser: (userId: string | null) => void) => void;
}> = [
  {
    kind: 'authenticated_ready',
    label: 'sign-out',
    invalidate: (guard, setUser) => { setUser(null); guard.invalidate(); },
  },
  {
    kind: 'authenticated_select_branch',
    label: 'newer selection',
    invalidate: (guard) => { guard.begin(USER_A); },
  },
  {
    kind: 'authenticated_no_branches',
    label: 'refresh',
    invalidate: (guard) => { guard.begin(USER_A); },
  },
  {
    kind: 'authenticated_no_membership',
    label: 'identity change',
    invalidate: (guard, setUser) => { setUser(USER_B); guard.invalidate(); },
  },
];

for (const testCase of staleCases) {
  const outcome = await runMicrotaskRace(testCase.kind, testCase.invalidate);
  assert(outcome.publications.length === 0, `${testCase.label} prevents stale workspace publication`);
  assert(outcome.states.length === 0, `${testCase.label} prevents stale ready/selection/unavailable/no-membership state`);
  assert(outcome.preferences.length === 0, `${testCase.label} prevents stale preference publication`);
}

// A request already superseded before a query boundary must not start its load.
{
  const guard = new WorkspaceRequestGuard();
  const token = guard.begin(USER_A);
  let loadCalls = 0;
  guard.invalidate();
  const result = await guard.waitForCurrent(token, () => USER_A, async () => {
    loadCalls += 1;
    return 'should-not-run';
  });
  assert(result.status === 'superseded' && loadCalls === 0, 'superseded continuation starts zero subsequent queries');
}

// Invalidation between one helper result and its caller continuation prevents
// the caller from starting the next query.
{
  const guard = new WorkspaceRequestGuard();
  const token = guard.begin(USER_A);
  const firstLoad = deferred<string>();
  let secondLoadCalls = 0;
  const firstResult = guard.waitForCurrent(token, () => USER_A, () => firstLoad.promise);
  const invalidate = firstResult.then(() => { guard.invalidate(); });
  const caller = (async () => {
    const result = await firstResult;
    if (result.status !== 'current') return;
    if (!guard.isCurrent(token, USER_A)) return;
    await guard.waitForCurrent(token, () => USER_A, async () => {
      secondLoadCalls += 1;
      return 'second';
    });
  })();
  firstLoad.resolve('first');
  await Promise.all([invalidate, caller]);
  assert(secondLoadCalls === 0, 'caller-side freshness check prevents the next query after microtask invalidation');
}

// Normal current publication remains synchronous and works for every outcome.
for (const kind of staleCases.map((testCase) => testCase.kind)) {
  const guard = new WorkspaceRequestGuard();
  const token = guard.begin(USER_A);
  const states: string[] = [];
  const preferences: string[] = [];
  const published = guard.publishIfCurrent(token, () => USER_A, () => {
    states.push(kind);
    if (kind !== 'authenticated_no_membership') preferences.push('pharmacy-hint');
  });
  assert(published && states[0] === kind, `normal ${kind} publication succeeds`);
  assert(preferences.length === (kind === 'authenticated_no_membership' ? 0 : 1), `normal ${kind} preference behavior is preserved`);
}

console.log(`MVP-01B publication boundary tests: ${passed} passed`);
