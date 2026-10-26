export interface PosScopeToken {
  generation: number;
  scope_key: string;
}

export const capturePosScope = (generation: number, scopeKey: string): PosScopeToken => ({
  generation,
  scope_key: scopeKey
});

export const isPosScopeCurrent = (
  token: PosScopeToken,
  currentGeneration: number,
  currentScopeKey: string | null
): boolean => token.generation === currentGeneration && token.scope_key === currentScopeKey;

export const runPosScopeBoundTask = async <T>(
  token: PosScopeToken,
  isCurrent: () => boolean,
  task: () => Promise<T>,
): Promise<{ accepted: true; value: T } | { accepted: true; error: unknown } | { accepted: false }> => {
  try {
    const value = await task();
    return isCurrent() ? { accepted: true, value } : { accepted: false };
  } catch (error: unknown) {
    return isCurrent() ? { accepted: true, error } : { accepted: false };
  }
};
