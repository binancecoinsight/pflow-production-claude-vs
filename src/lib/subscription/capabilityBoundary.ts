export interface CapabilityToken {
  identity: string;
  generation: number;
}

/** Rejects delayed mutation completions after scope, entitlement, or unmount changes. */
export class CapabilityAsyncBoundary {
  private identity: string;
  private allowed: boolean;
  private generation = 0;

  constructor(identity: string, allowed: boolean) {
    this.identity = identity;
    this.allowed = allowed;
  }

  update(identity: string, allowed: boolean): boolean {
    if (identity !== this.identity || allowed !== this.allowed) {
      this.identity = identity;
      this.allowed = allowed;
      this.generation += 1;
      return true;
    }
    return false;
  }

  begin(): CapabilityToken | null {
    return this.allowed ? { identity: this.identity, generation: this.generation } : null;
  }

  accepts(token: CapabilityToken | null): boolean {
    return token !== null && this.allowed && token.identity === this.identity && token.generation === this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }
}

export const runCapabilityBoundTask = async <T>(
  boundary: CapabilityAsyncBoundary,
  task: () => Promise<T>,
): Promise<{ accepted: true; value: T } | { accepted: true; error: unknown } | { accepted: false }> => {
  const token = boundary.begin();
  if (!token) return { accepted: false };
  try {
    const value = await task();
    return boundary.accepts(token) ? { accepted: true, value } : { accepted: false };
  } catch (error: unknown) {
    return boundary.accepts(token) ? { accepted: true, error } : { accepted: false };
  }
};
