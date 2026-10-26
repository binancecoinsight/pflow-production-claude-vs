import assert from 'node:assert/strict';
import { buildGuardedEdgeCleanupSql, preserveFailureThroughCleanup, runGuardedEdgeCleanup } from './edge-fixture-cleanup.mjs';

const roots = {
  pharmacies: [{ id: '11111111-1111-4111-8111-111111111111', name: 'EDGE_TEST_ROOT' }],
  users: [{ id: '22222222-2222-4222-8222-222222222222', email: 'edge-test@local.test', bootstrapName: 'EDGE_TEST_BOOTSTRAP' }],
};
const sql = buildGuardedEdgeCleanupSql(roots);
for (const required of [
  'fixture pharmacy identity mismatch', 'fixture user identity mismatch', 'bootstrap pharmacy identity mismatch',
  'fixture email reverse-identity mismatch', 'e.expected_id IS NOT NULL AND u.id=e.expected_id',
  'ambiguous Auth-create ownership unproven', 'p.owner_id=u.id AND p.name=e.bootstrap_name',
  'SET LOCAL session_replication_role = replica', 'SET LOCAL session_replication_role = origin',
  'NOT EXISTS (SELECT 1 FROM pf_expected_pharmacies x WHERE x.id=p.id)',
  'pf_cleanup_pharmacies', 'DELETE FROM public.sale_return_line_allocations', 'DELETE FROM public.sync_journal',
  'DELETE FROM public.pharmacies', 'DELETE FROM auth.users', 'fixture roots remain', "'expected_user_ids'",
]) assert(sql.includes(required), `cleanup SQL contains ${required}`);
assert.throws(() => buildGuardedEdgeCleanupSql({ pharmacies: [], users: [] }));
assert.throws(() => buildGuardedEdgeCleanupSql({ pharmacies: [{ id: 'bad', name: 'ok' }], users: roots.users }));
assert.throws(() => buildGuardedEdgeCleanupSql({ pharmacies: roots.pharmacies, users: [{ ...roots.users[0], bootstrapName: "bad'name" }] }));
assert(buildGuardedEdgeCleanupSql({ pharmacies: roots.pharmacies, users: [{ ...roots.users[0], id: null }] }).includes('NULL::uuid'), 'email-bound cleanup handles ambiguous Auth create response');

let invoked = 0;
assert.deepEqual(runGuardedEdgeCleanup(() => { invoked += 1; return '{"pharmacies":0,"expected_user_ids":0,"users":0,"profiles":0,"memberships":0}'; }, roots), { pharmacies: 0, expected_user_ids: 0, users: 0, profiles: 0, memberships: 0 });
assert.equal(invoked, 1);
assert.throws(() => runGuardedEdgeCleanup(() => '{"pharmacies":0,"expected_user_ids":0,"users":1,"profiles":0,"memberships":0}', roots));
assert.throws(() => runGuardedEdgeCleanup(() => '{"pharmacies":0,"expected_user_ids":1,"users":0,"profiles":0,"memberships":0}', roots));

let successCleanup = false;
assert.equal(await preserveFailureThroughCleanup(async () => 'result', async () => { successCleanup = true; }), 'result');
assert.equal(successCleanup, true, 'cleanup runs after scenario success');

const events = [];
await assert.rejects(
  preserveFailureThroughCleanup(async () => { events.push('work'); throw new Error('work failed'); }, async () => { events.push('cleanup'); }),
  /work failed/,
);
assert.deepEqual(events, ['work', 'cleanup'], 'cleanup runs after scenario failure');
await assert.rejects(
  preserveFailureThroughCleanup(async () => { throw new Error('work failed'); }, async () => { throw new Error('cleanup failed'); }),
  AggregateError,
);

console.log('Edge fixture cleanup synthetic tests: passed');
