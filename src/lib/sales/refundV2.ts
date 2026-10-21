import { HistoricalSale, HistoricalSaleLineItem } from './history';

export const REFUND_V2_MAX_MINOR = 9_999_999_999;
export const REFUND_V2_SUPPORTED_CURRENCIES = new Set(['NGN', 'USD']);

export interface RefundV2ItemInput {
  sale_item_id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  restock_to_inventory?: boolean;
}

export interface RefundV2LineAllocation {
  sale_item_id: string;
  entitlement_minor: number;
  refund_minor: number;
}

const assertSafeMinor = (value: number, name: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer minor-unit value`);
  }
};

const allocateByGross = (amount: number, lines: HistoricalSaleLineItem[]): Map<string, number> => {
  const grossTotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  if (grossTotal <= 0) throw new Error('SALE_FINANCIAL_INCONSISTENCY');
  const floors = lines.map((line) => ({
    id: line.id,
    value: Math.floor((amount * (line.quantity * line.unit_price)) / grossTotal),
    remainder: (amount * (line.quantity * line.unit_price)) % grossTotal
  }));
  const remaining = amount - floors.reduce((sum, allocation) => sum + allocation.value, 0);
  floors.sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id));
  for (let index = 0; index < remaining; index += 1) floors[index].value += 1;
  return new Map(floors.map((allocation) => [allocation.id, allocation.value]));
};

export const calculateRefundV2 = (
  sale: HistoricalSale,
  requestedItems: readonly RefundV2ItemInput[],
  previouslyReturnedBySaleItem: ReadonlyMap<string, number> = new Map()
): { total_minor: number; lines: RefundV2LineAllocation[] } => {
  if (!REFUND_V2_SUPPORTED_CURRENCIES.has(sale.currency.toUpperCase())) throw new Error('UNSUPPORTED_CURRENCY');
  if (!requestedItems.length) throw new Error('EMPTY_RETURN');
  for (const amount of [sale.subtotal, sale.discount, sale.tax, sale.total]) assertSafeMinor(amount, 'Sale amount');
  const lines = [...sale.line_items].sort((left, right) => left.id.localeCompare(right.id));
  const lineGross = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
  const lineDiscount = lines.reduce((sum, line) => sum + line.discount, 0);
  const lineTax = lines.reduce((sum, line) => sum + line.tax, 0);
  const lineTotal = lines.reduce((sum, line) => sum + line.line_total, 0);
  if (lineGross !== sale.subtotal || sale.discount < lineDiscount || sale.tax < lineTax || sale.total !== sale.subtotal - sale.discount + sale.tax) {
    throw new Error('SALE_FINANCIAL_INCONSISTENCY');
  }
  const headerDiscount = allocateByGross(sale.discount - lineDiscount, lines);
  const headerTax = allocateByGross(sale.tax - lineTax, lines);
  if (lineTotal < 0) throw new Error('SALE_FINANCIAL_INCONSISTENCY');
  const seen = new Set<string>();
  const allocations: RefundV2LineAllocation[] = requestedItems.map((requested) => {
    if (seen.has(requested.sale_item_id)) throw new Error('DUPLICATE_SALE_ITEM');
    seen.add(requested.sale_item_id);
    if (!Number.isSafeInteger(requested.quantity) || requested.quantity <= 0) throw new Error('INVALID_QUANTITY');
    const line = lines.find((candidate) => candidate.id === requested.sale_item_id);
    if (!line || line.product_id !== requested.product_id || line.batch_id !== requested.batch_id) throw new Error('ITEM_NOT_IN_SALE');
    const prior = previouslyReturnedBySaleItem.get(line.id) || 0;
    if (!Number.isSafeInteger(prior) || prior < 0 || prior + requested.quantity > line.quantity) throw new Error('EXCEEDS_RETURNABLE_QUANTITY');
    const entitlement = line.line_total - (headerDiscount.get(line.id) || 0) + (headerTax.get(line.id) || 0);
    if (entitlement < 0) throw new Error('SALE_FINANCIAL_INCONSISTENCY');
    const refund = Math.floor((entitlement * (prior + requested.quantity)) / line.quantity)
      - Math.floor((entitlement * prior) / line.quantity);
    return { sale_item_id: line.id, entitlement_minor: entitlement, refund_minor: refund };
  });
  const totalMinor = allocations.reduce((sum, allocation) => sum + allocation.refund_minor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0 || totalMinor > REFUND_V2_MAX_MINOR || totalMinor > sale.total) {
    throw new Error('INVALID_REFUND_AMOUNT');
  }
  return { total_minor: totalMinor, lines: allocations };
};
