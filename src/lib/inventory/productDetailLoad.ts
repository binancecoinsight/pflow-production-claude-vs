export interface ProductDetailLoadBinding {
  readonly workspaceKey: string;
  readonly pharmacyId: string;
  readonly productId: string;
}

export interface ProductDetailBatchAssociation {
  readonly pharmacy_id: string;
  readonly product_id: string;
}

interface ProductDetailLoadToken extends ProductDetailLoadBinding {
  readonly generation: number;
}

export interface ProductDetailLoadOptions<TBatch extends ProductDetailBatchAssociation> {
  readonly coordinator: ProductDetailLoadCoordinator;
  readonly binding: ProductDetailLoadBinding;
  readonly currentBinding: () => ProductDetailLoadBinding | null;
  readonly load: () => PromiseLike<readonly TBatch[]>;
  readonly publishLoading: (loading: boolean) => void;
  readonly publishSuccess: (batches: readonly TBatch[]) => void;
  readonly publishUnavailable: () => void;
}

function bindingsMatch(
  left: ProductDetailLoadBinding,
  right: ProductDetailLoadBinding | null,
): boolean {
  return right !== null
    && left.workspaceKey === right.workspaceKey
    && left.pharmacyId === right.pharmacyId
    && left.productId === right.productId;
}

function hasExpectedAssociation<TBatch extends ProductDetailBatchAssociation>(
  value: unknown,
  binding: ProductDetailLoadBinding,
): value is readonly TBatch[] {
  return Array.isArray(value) && value.every((batch: unknown) => (
    typeof batch === 'object'
    && batch !== null
    && !Array.isArray(batch)
    && (batch as Record<string, unknown>).pharmacy_id === binding.pharmacyId
    && (batch as Record<string, unknown>).product_id === binding.productId
  ));
}

/**
 * Owns the publication boundary for the production product-detail loader.
 * Generation identity is required in addition to product/workspace identity,
 * so an A -> B -> A sequence cannot revive the first A request.
 */
export class ProductDetailLoadCoordinator {
  private generation = 0;
  private disposed = false;

  begin(binding: ProductDetailLoadBinding): ProductDetailLoadToken {
    this.generation += 1;
    return Object.freeze({ ...binding, generation: this.generation });
  }

  invalidate(): void {
    this.generation += 1;
  }

  activate(): void {
    this.disposed = false;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
  }

  publishIfCurrent(
    token: ProductDetailLoadToken,
    currentBinding: () => ProductDetailLoadBinding | null,
    publish: () => void,
  ): boolean {
    if (this.disposed
        || token.generation !== this.generation
        || !bindingsMatch(token, currentBinding())) return false;
    publish();
    return true;
  }
}

/**
 * Runs the real InventoryView detail-load lifecycle. Every success, failure,
 * and loading-finalization publication passes through the same synchronous
 * freshness check immediately before its state update.
 */
export async function runProductDetailLoad<TBatch extends ProductDetailBatchAssociation>(
  options: ProductDetailLoadOptions<TBatch>,
): Promise<'published' | 'unavailable' | 'superseded'> {
  const token = options.coordinator.begin(options.binding);
  if (!options.coordinator.publishIfCurrent(token, options.currentBinding, () => {
    options.publishLoading(true);
  })) return 'superseded';

  let outcome: 'published' | 'unavailable' | 'superseded' = 'superseded';
  try {
    const batches = await options.load();
    if (!hasExpectedAssociation<TBatch>(batches, options.binding)) {
      const unavailable = options.coordinator.publishIfCurrent(token, options.currentBinding, () => {
        options.publishUnavailable();
      });
      outcome = unavailable ? 'unavailable' : 'superseded';
    } else {
      const immutableBatches = Object.freeze([...batches]);
      const published = options.coordinator.publishIfCurrent(token, options.currentBinding, () => {
        options.publishSuccess(immutableBatches);
      });
      outcome = published ? 'published' : 'superseded';
    }
  } catch {
    const unavailable = options.coordinator.publishIfCurrent(token, options.currentBinding, () => {
      options.publishUnavailable();
    });
    outcome = unavailable ? 'unavailable' : 'superseded';
  } finally {
    options.coordinator.publishIfCurrent(token, options.currentBinding, () => {
      options.publishLoading(false);
    });
  }
  return outcome;
}
