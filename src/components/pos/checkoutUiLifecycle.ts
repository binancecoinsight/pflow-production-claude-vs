export interface CheckoutRequestToken {
  identity: string;
  generation: number;
}

/** Shared request boundary used by POS UI adapters to reject delayed work from an older checkout. */
export class CheckoutAsyncBoundary {
  private identity: string;
  private generation = 0;

  constructor(identity: string) {
    this.identity = identity;
  }

  reset(identity: string): void {
    if (identity !== this.identity) {
      this.identity = identity;
      this.generation++;
    }
  }

  begin(): CheckoutRequestToken {
    return { identity: this.identity, generation: this.generation };
  }

  accepts(token: CheckoutRequestToken): boolean {
    return token.identity === this.identity && token.generation === this.generation;
  }

  invalidate(): void {
    this.generation++;
  }
}

export type CheckoutBoundResult<T> =
  | { accepted: true; value: T }
  | { accepted: true; error: unknown }
  | { accepted: false };

/** Production async adapter: a completion may update UI only while its checkout token is current. */
export const runCheckoutBoundTask = async <T>(
  boundary: CheckoutAsyncBoundary,
  task: () => Promise<T>
): Promise<CheckoutBoundResult<T>> => {
  const token = boundary.begin();
  try {
    const value = await task();
    return boundary.accepts(token) ? { accepted: true, value } : { accepted: false };
  } catch (error: unknown) {
    return boundary.accepts(token) ? { accepted: true, error } : { accepted: false };
  }
};

export const initialCheckoutUiState = (totalMinor: number) => ({
  selectedCustomerId: null as string | null,
  paymentMethod: 'CASH' as const,
  tenderInput: (totalMinor / 100).toFixed(2),
  productSearch: '',
  customerSearch: '',
  customerRequestPending: false
});
