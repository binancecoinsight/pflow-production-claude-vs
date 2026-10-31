import {
  AuthSessionTransitionCoordinator,
  SessionTransitionEffects,
} from './sessionTransition';
import { WorkspaceRequestGuard } from './membershipWorkspace';

interface TestUser { id: string }
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
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
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};

const USER_A: TestUser = { id: '11111111-1111-4111-8111-111111111111' };
const USER_B: TestUser = { id: '22222222-2222-4222-8222-222222222222' };

const createHarness = (deferWorkspace = false) => {
  const workspaceGuard = new WorkspaceRequestGuard();
  let currentUser: TestUser | null = null;
  const identities: string[] = [];
  const cleared: string[] = [];
  const workspaceStarts: string[] = [];
  const workspacePublications: string[] = [];
  const workspaceLoads: Array<{ userId: string; deferred: Deferred<string> }> = [];

  const effects: SessionTransitionEffects<TestUser> = {
    invalidateWorkspace: () => workspaceGuard.invalidate(),
    publishIdentity: (user) => {
      currentUser = user;
      identities.push(user.id);
    },
    clearIdentity: () => {
      currentUser = null;
      cleared.push('cleared');
    },
    resolveWorkspace: async (user) => {
      const token = workspaceGuard.begin(user.id);
      workspaceStarts.push(user.id);
      if (!deferWorkspace) {
        workspacePublications.push(user.id);
        return;
      }
      const load = deferred<string>();
      workspaceLoads.push({ userId: user.id, deferred: load });
      const result = await workspaceGuard.waitForCurrent(token, () => currentUser?.id || null, () => load.promise);
      if (result.status === 'current') workspacePublications.push(`${user.id}:${result.value}`);
    },
  };

  return {
    effects, workspaceGuard, identities, cleared, workspaceStarts,
    workspacePublications, workspaceLoads,
    currentUser: () => currentUser,
  };
};

// A provider response arriving after sign-out cannot publish identity or start resolution.
{
  const coordinator = new AuthSessionTransitionCoordinator<TestUser>();
  const harness = createHarness();
  const response = deferred<TestUser>();
  const attempt = coordinator.beginSignIn();
  const completion = response.promise.then((user) => coordinator.completeSignIn(attempt, user, harness.effects));
  coordinator.cancelSession(harness.effects);
  response.resolve(USER_A);
  assert(await completion === 'superseded', 'sign-in response after sign-out is superseded');
  assert(harness.identities.length === 0 && harness.workspaceStarts.length === 0, 'sign-out prevents stale identity publication and workspace start');
  assert(harness.currentUser() === null && harness.cleared.length === 1, 'sign-out remains the current cleared session');
}

// The newer attempt wins even when the older provider response arrives last.
{
  const coordinator = new AuthSessionTransitionCoordinator<TestUser>();
  const harness = createHarness();
  const responseA = deferred<TestUser>();
  const responseB = deferred<TestUser>();
  const attemptA = coordinator.beginSignIn();
  const completionA = responseA.promise.then((user) => coordinator.completeSignIn(attemptA, user, harness.effects));
  const attemptB = coordinator.beginSignIn();
  const completionB = responseB.promise.then((user) => coordinator.completeSignIn(attemptB, user, harness.effects));
  responseB.resolve(USER_B);
  assert(await completionB === 'published', 'newer sign-in publishes its session');
  responseA.resolve(USER_A);
  assert(await completionA === 'superseded', 'older sign-in response is superseded');
  assert(harness.currentUser()?.id === USER_B.id && harness.identities.join(',') === USER_B.id, 'older result never replaces newer identity');
}

// An identity-changing Auth event supersedes a deferred initial-session read.
{
  const coordinator = new AuthSessionTransitionCoordinator<TestUser>();
  const harness = createHarness();
  const initialResponse = deferred<TestUser | null>();
  const initialToken = coordinator.beginInitialSessionRead();
  const initialCompletion = initialResponse.promise.then((user) => coordinator.completeInitialSession(initialToken, user, harness.effects));
  assert(await coordinator.applyAuthEvent(USER_B, harness.effects) === 'published', 'identity-changing Auth event publishes current session');
  initialResponse.resolve(USER_A);
  assert(await initialCompletion === 'superseded', 'late initial-session response is superseded');
  assert(harness.currentUser()?.id === USER_B.id && harness.workspaceStarts.length === 1, 'late initial session cannot restart old workspace');
}

// Refresh and pharmacy-selection loads use the same production guard method.
{
  const guard = new WorkspaceRequestGuard();
  let currentUserId: string | null = USER_A.id;
  const refresh = deferred<string>();
  const selection = deferred<string>();
  const publications: string[] = [];
  const refreshToken = guard.begin(USER_A.id);
  const refreshRun = guard.waitForCurrent(refreshToken, () => currentUserId, () => refresh.promise)
    .then((result) => { if (result.status === 'current') publications.push(result.value); return result.status; });
  const selectionToken = guard.begin(USER_A.id);
  const selectionRun = guard.waitForCurrent(selectionToken, () => currentUserId, () => selection.promise)
    .then((result) => { if (result.status === 'current') publications.push(result.value); return result.status; });
  refresh.resolve('refresh');
  assert(await refreshRun === 'superseded', 'overlapping refresh result is superseded by pharmacy selection');
  selection.resolve('selection');
  assert(await selectionRun === 'current' && publications.join(',') === 'selection', 'only current pharmacy selection publishes');
  currentUserId = null;
}

// Auth-event-first ordering adopts once; the matching sign-in result is a no-op.
{
  const coordinator = new AuthSessionTransitionCoordinator<TestUser>();
  const harness = createHarness();
  const attempt = coordinator.beginSignIn();
  assert(await coordinator.applyAuthEvent(USER_A, harness.effects) === 'published', 'Auth event may legitimately arrive before sign-in response');
  assert(await coordinator.completeSignIn(attempt, USER_A, harness.effects) === 'already_current', 'matching sign-in result recognizes already-current event session');
  assert(harness.identities.length === 1 && harness.workspaceStarts.length === 1, 'event-first ordering does not duplicate identity or resolution');
}

// Result-first ordering remains valid; a later same-user Auth event supersedes
// the first workspace load and only the event generation may publish.
{
  const coordinator = new AuthSessionTransitionCoordinator<TestUser>();
  const harness = createHarness(true);
  const attempt = coordinator.beginSignIn();
  const resultFirst = coordinator.completeSignIn(attempt, USER_A, harness.effects);
  await flush();
  const eventSecond = coordinator.applyAuthEvent(USER_A, harness.effects);
  await flush();
  assert(harness.workspaceLoads.length === 2, 'result-first then Auth-event ordering starts two guarded resolutions');
  harness.workspaceLoads[0].deferred.resolve('old');
  await resultFirst;
  harness.workspaceLoads[1].deferred.resolve('current');
  await eventSecond;
  assert(harness.workspacePublications.join(',') === `${USER_A.id}:current`, 'later Auth event suppresses the earlier workspace publication');
}

// Failure and cancellation produce no stale publication, including a rejected
// load whose request was invalidated before the rejection arrived.
{
  const coordinator = new AuthSessionTransitionCoordinator<TestUser>();
  const harness = createHarness();
  const failedAttempt = coordinator.beginSignIn();
  assert(coordinator.failSignIn(failedAttempt) === 'failed', 'current failed sign-in closes its attempt');
  assert(await coordinator.completeSignIn(failedAttempt, USER_A, harness.effects) === 'superseded', 'failed attempt cannot later publish');

  const guard = new WorkspaceRequestGuard();
  const failedLoad = deferred<string>();
  let currentUserId: string | null = USER_A.id;
  const token = guard.begin(USER_A.id);
  const run = guard.waitForCurrent(token, () => currentUserId, () => failedLoad.promise);
  currentUserId = null;
  guard.invalidate();
  failedLoad.reject(new Error('cancelled request'));
  assert((await run).status === 'superseded', 'cancelled rejected load cannot publish failure or workspace state');
  assert(harness.identities.length === 0 && harness.workspaceStarts.length === 0, 'failure path publishes no identity or workspace');
}

console.log(`MVP-01B session transition tests: ${passed} passed`);
