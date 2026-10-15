/**
 * PharmacyFlow Sales Money Calculation Engine
 * 
 * Provides deterministic, integer minor-unit financial calculations for sales line items,
 * discounts, taxes, and final totals. Avoids floating-point rounding hazards.
 */

import { SaleLineItemInput, SaleTotals } from './types';

/**
 * Calculates deterministic totals for a sale and all its constituent line items.
 * 
 * Evaluation Order:
 * 1. For each line: line_subtotal = quantity * unit_price
 * 2. line_total = max(0, line_subtotal - line_discount + line_tax)
 * 3. subtotal = sum(line_subtotals)
 * 4. total_discount = sum(line_discounts) + sale_discount
 * 5. total_tax = sum(line_taxes) + sale_tax
 * 6. total = max(0, subtotal - total_discount + total_tax)
 */
export const calculateSaleTotals = (
  lineItems: readonly SaleLineItemInput[],
  saleDiscount: number = 0,
  saleTax: number = 0
): SaleTotals => {
  let subtotal = 0;
  let lineDiscounts = 0;
  let lineTaxes = 0;
  const lineTotals: number[] = [];

  for (const item of lineItems) {
    const qty = Math.max(0, Math.floor(item.quantity));
    const price = Math.max(0, Math.floor(item.unit_price));
    const discount = Math.max(0, Math.floor(item.discount || 0));
    const tax = Math.max(0, Math.floor(item.tax || 0));

    const lineSubtotal = qty * price;
    const lineTotal = Math.max(0, lineSubtotal - discount + tax);

    subtotal += lineSubtotal;
    lineDiscounts += discount;
    lineTaxes += tax;
    lineTotals.push(lineTotal);
  }

  const cleanSaleDiscount = Math.max(0, Math.floor(saleDiscount || 0));
  const cleanSaleTax = Math.max(0, Math.floor(saleTax || 0));

  const totalDiscount = lineDiscounts + cleanSaleDiscount;
  const totalTax = lineTaxes + cleanSaleTax;
  const total = Math.max(0, subtotal - totalDiscount + totalTax);

  return {
    subtotal,
    lineDiscounts,
    saleDiscount: cleanSaleDiscount,
    totalDiscount,
    lineTaxes,
    saleTax: cleanSaleTax,
    totalTax,
    total,
    lineTotals
  };
};
