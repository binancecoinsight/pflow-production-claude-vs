/**
 * PharmacyFlow Customer Validation & Normalization (Phase 5D-13)
 * 
 * Enforces sanitization, format constraints, and tenant validation.
 */

import { CreateCustomerInput, CustomerValidationResult, UpdateCustomerInput } from './types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidUuid = (id: string): boolean => {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
};

/**
 * Normalizes phone numbers (trims whitespace, preserves leading + for country code,
 * strips multiple consecutive spaces).
 */
export const normalizePhoneNumber = (phone?: string | null): string | null => {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : null;
};

/**
 * Normalizes customer name (collapses multiple whitespaces, trims).
 */
export const normalizeCustomerName = (name: string): string => {
  return (name || '').trim().replace(/\s+/g, ' ');
};

export const validateCreateCustomerInput = (input: CreateCustomerInput): CustomerValidationResult => {
  const errors: CustomerValidationResult['errors'] = [];

  if (!input.pharmacy_id || !isValidUuid(input.pharmacy_id)) {
    errors.push({
      field: 'pharmacy_id',
      code: 'INVALID_UUID',
      message: 'pharmacy_id must be a valid UUID v4'
    });
  }

  const name = normalizeCustomerName(input.name);
  if (!name || name.length < 2) {
    errors.push({
      field: 'name',
      code: 'REQUIRED_FIELD',
      message: 'Customer name is required and must be at least 2 characters'
    });
  } else if (name.length > 255) {
    errors.push({
      field: 'name',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'Customer name cannot exceed 255 characters'
    });
  }

  if (input.email) {
    const email = input.email.trim();
    if (email.length > 0 && (!EMAIL_REGEX.test(email) || email.length > 255)) {
      errors.push({
        field: 'email',
        code: 'INVALID_EMAIL',
        message: 'Email address must be a valid email format'
      });
    }
  }

  if (input.phone) {
    const phone = normalizePhoneNumber(input.phone);
    if (phone && phone.length > 50) {
      errors.push({
        field: 'phone',
        code: 'MAX_LENGTH_EXCEEDED',
        message: 'Phone number cannot exceed 50 characters'
      });
    }
  }

  if (input.address && input.address.trim().length > 500) {
    errors.push({
      field: 'address',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'Address cannot exceed 500 characters'
    });
  }

  if (input.notes && input.notes.trim().length > 1000) {
    errors.push({
      field: 'notes',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'Notes cannot exceed 1000 characters'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateUpdateCustomerInput = (input: UpdateCustomerInput): CustomerValidationResult => {
  const errors: CustomerValidationResult['errors'] = [];

  if (input.name !== undefined) {
    const name = normalizeCustomerName(input.name);
    if (!name || name.length < 2) {
      errors.push({
        field: 'name',
        code: 'INVALID_NAME',
        message: 'Customer name must be at least 2 characters'
      });
    } else if (name.length > 255) {
      errors.push({
        field: 'name',
        code: 'MAX_LENGTH_EXCEEDED',
        message: 'Customer name cannot exceed 255 characters'
      });
    }
  }

  if (input.email !== undefined && input.email !== null) {
    const email = input.email.trim();
    if (email.length > 0 && (!EMAIL_REGEX.test(email) || email.length > 255)) {
      errors.push({
        field: 'email',
        code: 'INVALID_EMAIL',
        message: 'Email address must be a valid email format'
      });
    }
  }

  if (input.phone !== undefined && input.phone !== null) {
    const phone = normalizePhoneNumber(input.phone);
    if (phone && phone.length > 50) {
      errors.push({
        field: 'phone',
        code: 'MAX_LENGTH_EXCEEDED',
        message: 'Phone number cannot exceed 50 characters'
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
