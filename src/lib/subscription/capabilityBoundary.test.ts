import { CapabilityAsyncBoundary, runCapabilityBoundTask } from './capabilityBoundary';

let passed = 0;
const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
  passed += 1;
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

const boundary = new CapabilityAsyncBoundary('tenant-a:user-a', true);
let busy = true;
const first = deferred<string>();
const delayedScope = runCapabilityBoundTask(boundary, () => first.promise);
if (boundary.update('tenant-b:user-a', true)) busy = false;
assert(!busy, 'scope invalidation exposes an immediate busy-state reset signal');
first.resolve('stale-success');
assert(!(await delayedScope).accepted, 'delayed mutation success is rejected after tenant scope changes');

const second = deferred<string>();
busy = true;
const delayedExpiry = runCapabilityBoundTask(boundary, () => second.promise);
if (boundary.update('tenant-b:user-a', false)) busy = false;
assert(!busy, 'expiry invalidation exposes an immediate busy-state reset signal');
second.reject(new Error('stale failure'));
assert(!(await delayedExpiry).accepted, 'delayed mutation failure is rejected after entitlement changes while mounted');
assert(!(await runCapabilityBoundTask(boundary, async () => 'never')).accepted, 'restricted capability does not invoke new mutation work');

busy = true;
if (boundary.update('tenant-b:user-a', true)) busy = false;
assert(!busy, 'renewal transition exposes an immediate busy-state reset signal');
assert(!boundary.update('tenant-b:user-a', true), 'unchanged renewed scope does not spuriously invalidate current work');
const third = deferred<string>();
const delayedUnmount = runCapabilityBoundTask(boundary, () => third.promise);
boundary.invalidate();
third.resolve('stale-unmount');
assert(!(await delayedUnmount).accepted, 'delayed mutation completion is rejected after unmount invalidation');

const valid = await runCapabilityBoundTask(boundary, async () => 'current');
assert(valid.accepted && 'value' in valid && valid.value === 'current', 'current authorized completion remains accepted');

console.log(`Capability boundary tests: ${passed} passed`);
