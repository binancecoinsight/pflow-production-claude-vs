/**
 * PharmacyFlow Inventory Expiry Evaluation Engine
 * 
 * Provides deterministic calculation of batch expiration states, days until expiry,
 * and boundary evaluation without mutating authoritative dates.
 */

import { BatchExpiryInfo } from './types';

/**
 * Parses an ISO date string ('YYYY-MM-DD' or full ISO) into UTC midnight timestamp.
 */
export const parseUtcMidnight = (dateInput: Date | string | number): number => {
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  if (dateInput instanceof Date) {
    return Date.UTC(dateInput.getUTCFullYear(), dateInput.getUTCMonth(), dateInput.getUTCDate());
  }

  const str = String(dateInput).trim();
  // If formatted as 'YYYY-MM-DD'
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return Date.UTC(year, month, day);
  }

  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date format for expiry evaluation: ${dateInput}`);
  }
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
};

/**
 * Computes deterministic expiry metadata for a batch against a reference timestamp.
 * 
 * Boundary Rule:
 * If reference date is on or after the batch expiry date, the batch is considered expired.
 */
export const computeExpiryInfo = (
  expiryDateStr: string,
  referenceDateInput: Date | string | number = new Date()
): BatchExpiryInfo => {
  const expiryUtc = parseUtcMidnight(expiryDateStr);
  const refUtc = parseUtcMidnight(referenceDateInput);

  const MS_PER_DAY = 86_400_000;
  const diffMs = expiryUtc - refUtc;
  const daysUntilExpiry = Math.round(diffMs / MS_PER_DAY);

  // Expired if ref date is on or past the expiry date (i.e. daysUntilExpiry <= 0)
  const isExpired = daysUntilExpiry <= 0;

  return {
    expiry_date: expiryDateStr,
    is_expired: isExpired,
    days_until_expiry: daysUntilExpiry
  };
};
