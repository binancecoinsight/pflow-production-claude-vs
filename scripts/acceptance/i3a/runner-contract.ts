export interface AdvisoryLockComponents { readonly classId: number; readonly objectId: number; }

export function splitAdvisoryLockKey(key: bigint): AdvisoryLockComponents {
  if (key < -(1n << 63n) || key > (1n << 63n) - 1n) throw new Error('Advisory lock key is outside signed bigint range.');
  const unsigned = BigInt.asUintN(64, key);
  return Object.freeze({
    classId: Number((unsigned >> 32n) & 0xffff_ffffn),
    objectId: Number(unsigned & 0xffff_ffffn),
  });
}

export function parseMutationAcknowledgement(value: string, expectedTag: string, expectedCount: number): number {
  if (!/^[A-Z][A-Z0-9_]{2,79}$/.test(expectedTag) || !Number.isSafeInteger(expectedCount) || expectedCount < 0)
    throw new Error('Mutation acknowledgment expectation is invalid.');
  const match = /^([A-Z][A-Z0-9_]{2,79})\|([0-9]+)$/.exec(value);
  if (!match || match[1] !== expectedTag) throw new Error('Mutation acknowledgment is malformed or has the wrong tag.');
  const actual = Number(match[2]);
  if (!Number.isSafeInteger(actual) || actual !== expectedCount) throw new Error(`Mutation affected ${actual} rows; expected ${expectedCount}.`);
  return actual;
}
