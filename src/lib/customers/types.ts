/**
 * PharmacyFlow Customer Domain Types (Phase 5D-13)
 * 
 * Defines tenant-scoped customer models, validation types,
 * and search/filter inputs.
 */

import { Customer, CustomerStatus } from '../../types/database';

export type { Customer, CustomerStatus };

export interface CreateCustomerInput {
  pharmacy_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  status?: CustomerStatus;
}

export interface CustomerFilterOptions {
  search?: string;
  status?: CustomerStatus | 'ALL';
  limit?: number;
  offset?: number;
}

export interface CustomerValidationError {
  field: string;
  code: string;
  message: string;
}

export interface CustomerValidationResult {
  isValid: boolean;
  errors: CustomerValidationError[];
}

export interface CustomerOperationResult {
  success: boolean;
  customer?: Customer;
  error?: string;
  errors?: CustomerValidationError[];
}
