/**
 * PharmacyFlow Supplier Validation & Normalization (Phase 5D-19)
 * 
 * Enforces sanitization, format constraints, and tenant validation.
 */

import { CreateSupplierInput, SupplierValidationResult, UpdateSupplierInput } from './types';

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
 * Normalizes supplier name (collapses multiple whitespaces, trims).
 */
export const normalizeSupplierName = (name: string): string => {
  return (name || '').trim().replace(/\s+/g, ' ');
};

/**
 * Normalizes contact person name (collapses whitespace, trims).
 */
export const normalizeContactPerson = (contact?: string | null): string | null => {
  if (!contact) return null;
  const cleaned = contact.trim().replace(/\s+/g, ' ');
  return cleaned.length > 0 ? cleaned : null;
};

/**
 * Normalizes email address (lowercased and trimmed).
 */
export const normalizeEmail = (email?: string | null): string | null => {
  if (!email) return null;
  const cleaned = email.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
};

export const validateCreateSupplierInput = (input: CreateSupplierInput): SupplierValidationResult => {
  const errors: SupplierValidationResult['errors'] = [];

  if (!input.pharmacy_id || !isValidUuid(input.pharmacy_id)) {
    errors.push({
      field: 'pharmacy_id',
      code: 'INVALID_UUID',
      message: 'pharmacy_id must be a valid UUID v4'
    });
  }

  const name = normalizeSupplierName(input.name);
  if (!name || name.length < 2) {
    errors.push({
      field: 'name',
      code: 'REQUIRED_FIELD',
      message: 'Supplier name is required and must be at least 2 characters'
    });
  } else if (name.length > 255) {
    errors.push({
      field: 'name',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'Supplier name cannot exceed 255 characters'
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

  if (input.contact_person) {
    const contact = input.contact_person.trim();
    if (contact.length > 255) {
      errors.push({
        field: 'contact_person',
        code: 'MAX_LENGTH_EXCEEDED',
        message: 'Contact person cannot exceed 255 characters'
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

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validateUpdateSupplierInput = (input: UpdateSupplierInput): SupplierValidationResult => {
  const errors: SupplierValidationResult['errors'] = [];

  if (input.name !== undefined) {
    const name = normalizeSupplierName(input.name);
    if (!name || name.length < 2) {
      errors.push({
        field: 'name',
        code: 'REQUIRED_FIELD',
        message: 'Supplier name must be at least 2 characters'
      });
    } else if (name.length > 255) {
      errors.push({
        field: 'name',
        code: 'MAX_LENGTH_EXCEEDED',
        message: 'Supplier name cannot exceed 255 characters'
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

  if (input.contact_person !== undefined && input.contact_person !== null) {
    const contact = input.contact_person.trim();
    if (contact.length > 255) {
      errors.push({
        field: 'contact_person',
        code: 'MAX_LENGTH_EXCEEDED',
        message: 'Contact person cannot exceed 255 characters'
      });
    }
  }

  if (input.address !== undefined && input.address !== null && input.address.trim().length > 500) {
    errors.push({
      field: 'address',
      code: 'MAX_LENGTH_EXCEEDED',
      message: 'Address cannot exceed 500 characters'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
