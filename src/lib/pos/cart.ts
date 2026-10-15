/**
 * PharmacyFlow POS Cart Engine (Phase 5D-5)
 * 
 * Manages in-memory POS carts, item additions, quantity updates, deterministic line calculations,
 * and integration with the Phase 5D-4 inventory read model.
 */

import { PosCart, PosCartLineItem, PosSessionContext, AddItemInput } from './types';
import {
  getProductById,
  getBatchesForProduct,
  getEligibleBatchesForProduct,
  selectRecommendedBatch,
  computeExpiryInfo
} from '../inventory/index';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
};

/**
 * Recalculates all cart totals in integer minor units.
 */
export const recalculateCartTotals = (cart: PosCart): PosCart => {
  let subtotal = 0;
  let lineDiscounts = 0;
  let lineTaxes = 0;

  const updatedLines: PosCartLineItem[] = cart.line_items.map((line) => {
    const qty = Math.max(1, Math.floor(line.quantity));
    const price = Math.max(0, Math.floor(line.unit_price));
    const lineSubtotal = qty * price;
    const discount = Math.min(lineSubtotal, Math.max(0, Math.floor(line.discount || 0)));
    const tax = Math.max(0, Math.floor(line.tax || 0));
    const lineTotal = Math.max(0, lineSubtotal - discount + tax);

    subtotal += lineSubtotal;
    lineDiscounts += discount;
    lineTaxes += tax;

    return {
      ...line,
      quantity: qty,
      unit_price: price,
      discount,
      tax,
      line_subtotal: lineSubtotal,
      line_total: lineTotal
    };
  });

  const saleDiscount = Math.max(0, Math.floor(cart.sale_discount || 0));
  const saleTax = Math.max(0, Math.floor(cart.sale_tax || 0));
  const totalDiscount = lineDiscounts + saleDiscount;
  const totalTax = lineTaxes + saleTax;
  const total = Math.max(0, subtotal - totalDiscount + totalTax);

  return {
    ...cart,
    line_items: updatedLines,
    subtotal,
    line_discounts: lineDiscounts,
    sale_discount: saleDiscount,
    total_discount: totalDiscount,
    line_taxes: lineTaxes,
    sale_tax: saleTax,
    total_tax: totalTax,
    total,
    updated_at: Date.now()
  };
};

/**
 * Initializes a new POS cart bound to the authenticated pharmacy, branch, and cashier context.
 */
export const createCart = (context: PosSessionContext): PosCart => {
  if (!isValidUuid(context.pharmacy_id)) {
    throw new Error(`Invalid pharmacy_id in POS session: ${context.pharmacy_id}`);
  }
  if (!isValidUuid(context.branch_id)) {
    throw new Error(`Invalid branch_id in POS session: ${context.branch_id}`);
  }
  if (!isValidUuid(context.cashier_id)) {
    throw new Error(`Invalid cashier_id (must be authenticated auth.users(id)): ${context.cashier_id}`);
  }

  // Explicitly verify cashier identity against authenticated user if provided
  if (context.authenticated_user_id) {
    if (!isValidUuid(context.authenticated_user_id)) {
      throw new Error(`Invalid authenticated_user_id: ${context.authenticated_user_id}`);
    }
    const normAuth = context.authenticated_user_id.toLowerCase().trim();
    const normCashier = context.cashier_id.toLowerCase().trim();
    if (normCashier !== normAuth) {
      throw new Error(
        `Cashier identity mismatch: cashier_id [${context.cashier_id}] does not match authenticated user [${context.authenticated_user_id}]`
      );
    }
  }

  const now = Date.now();
  return {
    pharmacy_id: context.pharmacy_id.toLowerCase().trim(),
    branch_id: context.branch_id.toLowerCase().trim(),
    cashier_id: context.cashier_id.toLowerCase().trim(),
    currency: (context.currency || 'NGN').toUpperCase().trim(),
    line_items: [],
    subtotal: 0,
    line_discounts: 0,
    sale_discount: 0,
    total_discount: 0,
    line_taxes: 0,
    sale_tax: 0,
    total_tax: 0,
    total: 0,
    created_at: now,
    updated_at: now
  };
};

/**
 * Creates a POS cart bound directly to the authenticated Supabase session and active pharmacy.
 */
export const createCartFromSession = (
  session: {
    user: { id: string };
    pharmacy: { id: string };
    branch?: { id: string } | null;
  },
  currency?: string
): PosCart => {
  if (!session?.user?.id) {
    throw new Error('Authenticated user session is required to create a POS cart');
  }
  if (!session?.pharmacy?.id) {
    throw new Error('Active pharmacy selection is required to create a POS cart');
  }

  return createCart({
    pharmacy_id: session.pharmacy.id,
    branch_id: session.branch?.id || '00000000-0000-0000-0000-000000000000',
    cashier_id: session.user.id,
    authenticated_user_id: session.user.id,
    currency
  });
};

/**
 * Adds a product and batch to the cart, utilizing Phase 5D-4 local read model.
 * If batch_id is omitted, auto-selects a non-expired batch via Phase 5D-4 recommendation.
 */
export const addItemToCart = async (
  cart: PosCart,
  input: AddItemInput,
  customFactory?: IDBFactory
): Promise<PosCart> => {
  if (!isValidUuid(input.product_id)) {
    throw new Error(`Invalid product_id: ${input.product_id}`);
  }

  const quantity = input.quantity !== undefined ? input.quantity : 1;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Quantity must be a positive integer, received: ${quantity}`);
  }

  // 1. Look up product in active pharmacy partition
  const product = await getProductById(cart.pharmacy_id, input.product_id, customFactory);
  if (!product) {
    throw new Error(`Product ${input.product_id} not found in pharmacy ${cart.pharmacy_id} catalog`);
  }

  if (product.status && product.status.toUpperCase() === 'INACTIVE') {
    throw new Error(`Product ${product.name} is currently inactive and cannot be sold`);
  }

  // 2. Resolve batch
  let resolvedBatchId: string;
  let batchNumber: string;
  let expiryDate: string;
  let defaultPrice: number;
  let projectedStock: number | undefined;

  if (input.batch_id) {
    if (!isValidUuid(input.batch_id)) {
      throw new Error(`Invalid batch_id: ${input.batch_id}`);
    }

    const batches = await getBatchesForProduct(cart.pharmacy_id, product.id, cart.branch_id, customFactory);
    const matchedBatch = batches.find((b) => b.id.toLowerCase() === input.batch_id!.toLowerCase().trim());

    if (!matchedBatch) {
      throw new Error(`Batch ${input.batch_id} not found for product ${product.name} in branch ${cart.branch_id}`);
    }

    // Expiry check
    const expiry = computeExpiryInfo(matchedBatch.expiry_date);
    if (expiry.is_expired) {
      throw new Error(`Batch ${matchedBatch.batch_number} expired on ${matchedBatch.expiry_date} and cannot be sold`);
    }

    resolvedBatchId = matchedBatch.id;
    batchNumber = matchedBatch.batch_number;
    expiryDate = matchedBatch.expiry_date;
    defaultPrice = matchedBatch.selling_price > 0 ? matchedBatch.selling_price : product.selling_price;
    projectedStock = matchedBatch.projected_stock;
  } else {
    // Auto-select batch using Phase 5D-4 provisional recommendation
    const eligibleBatches = await getEligibleBatchesForProduct(
      cart.pharmacy_id,
      product.id,
      { branchId: cart.branch_id },
      customFactory
    );

    const recommended = selectRecommendedBatch(eligibleBatches);
    if (!recommended) {
      throw new Error(`No eligible non-expired batches found for product ${product.name} in branch ${cart.branch_id}`);
    }

    resolvedBatchId = recommended.id;
    batchNumber = recommended.batch_number;
    expiryDate = recommended.expiry_date;
    defaultPrice = recommended.selling_price > 0 ? recommended.selling_price : product.selling_price;
    projectedStock = recommended.projected_stock;
  }

  const unitPrice = input.unit_price !== undefined ? Math.max(0, Math.floor(input.unit_price)) : defaultPrice;
  const lineDiscount = Math.max(0, Math.floor(input.discount || 0));
  const lineTax = Math.max(0, Math.floor(input.tax || 0));

  // 3. Check if identical product and batch already exists in cart
  const existingLineIndex = cart.line_items.findIndex(
    (li) => li.product_id === product.id && li.batch_id === resolvedBatchId
  );

  let updatedLines: PosCartLineItem[];

  if (existingLineIndex >= 0) {
    const existing = cart.line_items[existingLineIndex];
    const newQuantity = existing.quantity + quantity;
    const newDiscount = existing.discount + lineDiscount;
    const newTax = existing.tax + lineTax;
    const newSubtotal = newQuantity * existing.unit_price;

    updatedLines = [...cart.line_items];
    updatedLines[existingLineIndex] = {
      ...existing,
      quantity: newQuantity,
      discount: Math.min(newSubtotal, newDiscount),
      tax: newTax,
      line_subtotal: newSubtotal,
      line_total: Math.max(0, newSubtotal - newDiscount + newTax),
      projected_stock: projectedStock
    };
  } else {
    const lineSubtotal = quantity * unitPrice;
    const newLine: PosCartLineItem = {
      id: crypto.randomUUID(),
      product_id: product.id,
      batch_id: resolvedBatchId,
      product_name: product.name,
      batch_number: batchNumber,
      expiry_date: expiryDate,
      quantity,
      unit_price: unitPrice,
      discount: Math.min(lineSubtotal, lineDiscount),
      tax: lineTax,
      line_subtotal: lineSubtotal,
      line_total: Math.max(0, lineSubtotal - lineDiscount + lineTax),
      projected_stock: projectedStock
    };
    updatedLines = [...cart.line_items, newLine];
  }

  return recalculateCartTotals({
    ...cart,
    line_items: updatedLines
  });
};

/**
 * Updates the quantity of an existing line item in the cart.
 */
export const updateCartItemQuantity = (
  cart: PosCart,
  lineId: string,
  quantity: number
): PosCart => {
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Quantity must be a positive integer, received: ${quantity}`);
  }

  const lineIndex = cart.line_items.findIndex((li) => li.id === lineId);
  if (lineIndex < 0) {
    throw new Error(`Cart line item ${lineId} not found`);
  }

  const existing = cart.line_items[lineIndex];
  const newSubtotal = quantity * existing.unit_price;
  const newDiscount = Math.min(newSubtotal, existing.discount);

  const updatedLines = [...cart.line_items];
  updatedLines[lineIndex] = {
    ...existing,
    quantity,
    discount: newDiscount,
    line_subtotal: newSubtotal,
    line_total: Math.max(0, newSubtotal - newDiscount + existing.tax)
  };

  return recalculateCartTotals({
    ...cart,
    line_items: updatedLines
  });
};

/**
 * Removes a line item from the cart.
 */
export const removeCartItem = (cart: PosCart, lineId: string): PosCart => {
  const updatedLines = cart.line_items.filter((li) => li.id !== lineId);
  return recalculateCartTotals({
    ...cart,
    line_items: updatedLines
  });
};

/**
 * Updates global sale discount and tax in integer minor units.
 */
export const setCartDiscountsAndTaxes = (
  cart: PosCart,
  saleDiscount: number = 0,
  saleTax: number = 0
): PosCart => {
  if (typeof saleDiscount !== 'number' || !Number.isInteger(saleDiscount) || saleDiscount < 0) {
    throw new Error(`saleDiscount must be a non-negative integer minor unit`);
  }
  if (typeof saleTax !== 'number' || !Number.isInteger(saleTax) || saleTax < 0) {
    throw new Error(`saleTax must be a non-negative integer minor unit`);
  }

  return recalculateCartTotals({
    ...cart,
    sale_discount: saleDiscount,
    sale_tax: saleTax
  });
};

/**
 * Clears all items and totals from the cart while preserving session context.
 */
export const clearCart = (cart: PosCart): PosCart => {
  const now = Date.now();
  return {
    pharmacy_id: cart.pharmacy_id,
    branch_id: cart.branch_id,
    cashier_id: cart.cashier_id,
    currency: cart.currency,
    line_items: [],
    subtotal: 0,
    line_discounts: 0,
    sale_discount: 0,
    total_discount: 0,
    line_taxes: 0,
    sale_tax: 0,
    total_tax: 0,
    total: 0,
    created_at: cart.created_at,
    updated_at: now
  };
};
