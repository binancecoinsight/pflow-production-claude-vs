export interface SessionEvidence {
  name: 'A' | 'B'; backendPid: number; applicationName: string;
  readyCommittedAt: string; enteredCriticalAt: string; leftCriticalAt: string;
  outcome: string; authoritativeEffectCount: number;
}
export interface ConcurrencyEvidence {
  classification: 'POSTGRESQL_EXECUTED'; runId: string; caseId: string; barrierNonce: string;
  boundedWaitMs: number; expectedLock: { lockType: 'application_advisory'; classId: number; objectId: number };
  observedBlockerPid: number; observedWaiterPid: number; observedWaiterBlockers: readonly number[];
  sessions: readonly [SessionEvidence, SessionEvidence]; expectedOutcomes: readonly [string, string];
  expectedEffectCount: number; cancellation: 'NOT_REQUIRED' | 'VERIFIED_ROLLBACK';
}
export function validatePostgresConcurrencyEvidence(e: ConcurrencyEvidence): Readonly<ConcurrencyEvidence> {
  if (e.classification !== 'POSTGRESQL_EXECUTED') throw new Error('Mocked or sequential evidence is not PostgreSQL concurrency acceptance.');
  if (!/^[A-Za-z0-9:_-]{8,160}$/.test(e.barrierNonce) || !Number.isInteger(e.boundedWaitMs) || e.boundedWaitMs < 1 || e.boundedWaitMs > 60_000)
    throw new Error('Invalid barrier or bounded-wait evidence.');
  const [a, b] = e.sessions;
  if (a.name === b.name || !Number.isInteger(a.backendPid) || !Number.isInteger(b.backendPid) || a.backendPid === b.backendPid)
    throw new Error('Two distinct PostgreSQL backends are required.');
  if (new Set([e.observedBlockerPid, e.observedWaiterPid]).size !== 2
    || ![a.backendPid, b.backendPid].includes(e.observedBlockerPid) || ![a.backendPid, b.backendPid].includes(e.observedWaiterPid)
    || !e.observedWaiterBlockers.includes(e.observedBlockerPid)) throw new Error('Exact blocker/waiter relationship is unproven.');
  if (e.expectedLock.lockType !== 'application_advisory' || !Number.isInteger(e.expectedLock.classId) || !Number.isInteger(e.expectedLock.objectId))
    throw new Error('Tested lock identity is missing.');
  const times = [a, b].map(s => ({ ready: Date.parse(s.readyCommittedAt), start: Date.parse(s.enteredCriticalAt), end: Date.parse(s.leftCriticalAt) }));
  if (times.flatMap(Object.values).some(v => !Number.isFinite(v)) || times.some(t => t.ready > t.start || t.start >= t.end)
    || Math.max(times[0].start, times[1].start) >= Math.min(times[0].end, times[1].end)) throw new Error('Committed readiness and actual overlap are unproven.');
  const actual = [a.outcome, b.outcome].sort(), expected = [...e.expectedOutcomes].sort();
  if (!actual.every((v, i) => v === expected[i]) || [a, b].some(s => s.authoritativeEffectCount !== e.expectedEffectCount))
    throw new Error('Exact authoritative outcomes or counts mismatch.');
  if (!['NOT_REQUIRED', 'VERIFIED_ROLLBACK'].includes(e.cancellation)) throw new Error('Cancellation/rollback disposition is unverified.');
  return Object.freeze(e);
}
