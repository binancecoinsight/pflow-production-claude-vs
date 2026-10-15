/**
 * PharmacyFlow Sales Validation Engine
 * 
 * Centralized, strict validator enforcing domain invariants, UUID format,
 * positive quantities, non-negative monetary figures, and structural integrity.
 */

import { CreateSaleInput, SaleValidationResult, SaleValidationError, ALLOWED_PAYMENT_METHODS } from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUuid = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
};

export const validateSaleInput = (input: CreateSaleInput): SaleValidationResult => {
  const errors: SaleValidationError[] = [];

  // 1. Tenant & Operational Context
  if (!input.pharmacy_id || !isValidUuid(input.pharmacy_id)) {
    errors.push({
      field: 'pharmacy_id',
      code: 'INVALID_PHARMACY_ID',
      message: 'pharmacy_id is required and must be a valid UUID v4'
    });
  }

  if (!input.branch_id || !isValidUuid(input.branch_id)) {
    errors.push({
      field: 'branch_id',
      code: 'INVALID_BRANCH_ID',
      message: 'branch_id is required and must be a valid UUID v4'
    });
  }

  // 2. Authenticated Cashier Identity
  if (!input.cashier_id || !isValidUuid(input.cashier_id)) {
    errors.push({
      field: 'cashier_id',
      code: 'INVALID_CASHIER_ID',
      message: 'cashier_id is required and must reference an authenticated user UUID'
    });
  }

  // 3. Optional Client Operation ID
  if (input.client_op_id !== undefined && !isValidUuid(input.client_op_id)) {
    errors.push({
      field: 'client_op_id',
      code: 'INVALID_CLIENT_OP_ID',
      message: 'client_op_id must be a valid RFC 4122 UUID v4'
    });
  }

  // 4. Optional Customer Reference
  if (input.customer_id !== undefined && input.customer_id !== null && !isValidUuid(input.customer_id)) {
    errors.push({
      field: 'customer_id',
      code: 'INVALID_CUSTOMER_ID',
      message: 'customer_id must be a valid UUID v4 if provided'
    });
  }

  // 5. Payment Method
  if (!input.payment_method || !ALLOWED_PAYMENT_METHODS.includes(input.payment_method)) {
    errors.push({
      field: 'payment_method',
      code: 'INVALID_PAYMENT_METHOD',
      message: `payment_method must be one of: ${ALLOWED_PAYMENT_METHODS.join(', ')}`
    });
  }

  // 5b. Amount Tendered (Tender Integrity)
  if (input.amount_tendered !== undefined) {
    if (
      typeof input.amount_tendered !== 'number' ||
      !Number.isInteger(input.amount_tendered) ||
      input.amount_tendered < 0
    ) {
      errors.push({
        field: 'amount_tendered',
        code: 'INVALID_AMOUNT_TENDERED',
        message: 'amount_tendered must be a non-negative integer in minor currency units'
      });
    }
  }

  // 6. Currency
  if (input.currency !== undefined) {
    if (typeof input.currency !== 'string' || !/^[A-Z]{3}$/.test(input.currency.trim())) {
      errors.push({
        field: 'currency',
        code: 'INVALID_CURRENCY',
        message: 'currency must be a valid 3-letter uppercase code (e.g. NGN)'
      });
    }
  }

  // 7. Sale-level Discount & Tax
  if (input.sale_discount !== undefined) {
    if (
      typeof input.sale_discount !== 'number' ||
      !Number.isInteger(input.sale_discount) ||
      input.sale_discount < 0
    ) {
      errors.push({
        field: 'sale_discount',
        code: 'INVALID_SALE_DISCOUNT',
        message: 'sale_discount must be a non-negative integer in minor currency units'
      });
    }
  }

  if (input.sale_tax !== undefined) {
    if (
      typeof input.sale_tax !== 'number' ||
      !Number.isInteger(input.sale_tax) ||
      input.sale_tax < 0
    ) {
      errors.push({
        field: 'sale_tax',
        code: 'INVALID_SALE_TAX',
        message: 'sale_tax must be a non-negative integer in minor currency units'
      });
    }
  }

  // 8. Line Items Validation
  if (!Array.isArray(input.line_items) || input.line_items.length === 0) {
    errors.push({
      field: 'line_items',
      code: 'EMPTY_LINE_ITEMS',
      message: 'Sale must contain at least one line item'
    });
  } else {
    input.line_items.forEach((item, index) => {
      const linePrefix = `line_items[${index}]`;

      if (!item.product_id || !isValidUuid(item.product_id)) {
        errors.push({
          field: `${linePrefix}.product_id`,
          code: 'INVALID_PRODUCT_ID',
          message: 'product_id must be a valid UUID v4'
        });
      }

      if (!item.batch_id || !isValidUuid(item.batch_id)) {
        errors.push({
          field: `${linePrefix}.batch_id`,
          code: 'INVALID_BATCH_ID',
          message: 'batch_id must be a valid UUID v4'
        });
      }

      if (
        typeof item.quantity !== 'number' ||
        !Number.isInteger(item.quantity) ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0
      ) {
        errors.push({
          field: `${linePrefix}.quantity`,
          code: 'INVALID_QUANTITY',
          message: 'quantity must be a positive integer greater than 0'
        });
      }

      if (
        typeof item.unit_price !== 'number' ||
        !Number.isInteger(item.unit_price) ||
        !Number.isFinite(item.unit_price) ||
        item.unit_price < 0
      ) {
        errors.push({
          field: `${linePrefix}.unit_price`,
          code: 'INVALID_UNIT_PRICE',
          message: 'unit_price must be a non-negative integer in minor currency units'
        });
      }

      if (item.discount !== undefined) {
        if (
          typeof item.discount !== 'number' ||
          !Number.isInteger(item.discount) ||
          item.discount < 0
        ) {
          errors.push({
            field: `${linePrefix}.discount`,
            code: 'INVALID_LINE_DISCOUNT',
            message: 'discount must be a non-negative integer in minor currency units'
          });
        } else if (
          typeof item.quantity === 'number' &&
          typeof item.unit_price === 'number' &&
          item.discount > item.quantity * item.unit_price
        ) {
          errors.push({
            field: `${linePrefix}.discount`,
            code: 'DISCOUNT_EXCEEDS_SUBTOTAL',
            message: 'line discount cannot exceed the line item subtotal'
          });
        }
      }

      if (item.tax !== undefined) {
        if (
          typeof item.tax !== 'number' ||
          !Number.isInteger(item.tax) ||
          item.tax < 0
        ) {
          errors.push({
            field: `${linePrefix}.tax`,
            code: 'INVALID_LINE_TAX',
            message: 'tax must be a non-negative integer in minor currency units'
          });
        }
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
