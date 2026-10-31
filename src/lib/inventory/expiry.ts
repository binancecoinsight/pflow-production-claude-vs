/**
 * PharmacyFlow Inventory Expiry Evaluation Engine
 *
 * Batch expiry accepts exact Gregorian YYYY-MM-DD only. Reference dates accept
 * valid Date objects, finite epoch milliseconds, exact date-only values, or
 * strict ISO/RFC3339 timestamps with an explicit timezone.
 */

import { BatchExpiryInfo } from './types';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([Zz]|([+-])(\d{2}):(\d{2}))$/;
const MS_PER_DAY = 86_400_000;

export class InvalidInventoryDateError extends Error {
  readonly code = 'INVALID_INVENTORY_DATE';
  readonly field: 'expiry_date' | 'reference_date';

  constructor(field: 'expiry_date' | 'reference_date') {
    super(field === 'expiry_date'
      ? 'Inventory batch expiry date is invalid; exact Gregorian YYYY-MM-DD is required'
      : 'Inventory expiry reference date is invalid');
    this.name = 'InvalidInventoryDateError';
    this.field = field;
  }
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function utcTimestampForDateParts(year: number, month: number, day: number): number | null {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 1 || month > 12) return null;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth[month - 1]) return null;

  // setUTCFullYear preserves years 0001-0099 rather than applying Date.UTC's 1900 offset.
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

function parseExactDateOnly(value: string): number | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;
  return utcTimestampForDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

function utcMidnightForTimestamp(timestamp: number): number {
  const instant = new Date(timestamp);
  const midnight = new Date(0);
  midnight.setUTCHours(0, 0, 0, 0);
  midnight.setUTCFullYear(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
  const result = midnight.getTime();
  if (!Number.isFinite(result)) throw new InvalidInventoryDateError('reference_date');
  return result;
}

function parseStrictTimestamp(value: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const dateUtc = utcTimestampForDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (dateUtc === null || hour > 23 || minute > 59 || second > 59) return null;

  const milliseconds = match[7] ? Number(`${match[7]}000`.slice(0, 3)) : 0;
  let offsetMinutes = 0;
  if (match[8].toUpperCase() !== 'Z') {
    const offsetHour = Number(match[10]);
    const offsetMinute = Number(match[11]);
    if (offsetHour > 23 || offsetMinute > 59) return null;
    const direction = match[9] === '+' ? 1 : -1;
    offsetMinutes = direction * ((offsetHour * 60) + offsetMinute);
  }

  const localTimestamp = dateUtc
    + (hour * 3_600_000)
    + (minute * 60_000)
    + (second * 1_000)
    + milliseconds;
  const timestamp = localTimestamp - (offsetMinutes * 60_000);
  return Number.isFinite(new Date(timestamp).getTime()) ? timestamp : null;
}

/** Parses an exact batch expiry date without normalization. */
export const parseExpiryDateUtcMidnight = (expiryDate: string): number => {
  if (typeof expiryDate !== 'string') throw new InvalidInventoryDateError('expiry_date');
  const parsed = parseExactDateOnly(expiryDate);
  if (parsed === null) throw new InvalidInventoryDateError('expiry_date');
  return parsed;
};

/** Parses an approved reference date and returns its actual UTC calendar day. */
export const parseUtcMidnight = (dateInput: Date | string | number): number => {
  if (typeof dateInput === 'number') {
    if (!Number.isFinite(dateInput)) throw new InvalidInventoryDateError('reference_date');
    const timestamp = new Date(dateInput).getTime();
    if (!Number.isFinite(timestamp)) throw new InvalidInventoryDateError('reference_date');
    return utcMidnightForTimestamp(timestamp);
  }

  if (dateInput instanceof Date) {
    const timestamp = dateInput.getTime();
    if (!Number.isFinite(timestamp)) throw new InvalidInventoryDateError('reference_date');
    return utcMidnightForTimestamp(timestamp);
  }

  if (typeof dateInput !== 'string') throw new InvalidInventoryDateError('reference_date');
  const dateOnly = parseExactDateOnly(dateInput);
  if (dateOnly !== null) return dateOnly;
  const timestamp = parseStrictTimestamp(dateInput);
  if (timestamp === null) throw new InvalidInventoryDateError('reference_date');
  return utcMidnightForTimestamp(timestamp);
};

/**
 * Boundary rule: the reference UTC calendar day on or after expiry is expired.
 */
export const computeExpiryInfo = (
  expiryDateStr: string,
  referenceDateInput: Date | string | number = new Date(),
): BatchExpiryInfo => {
  const expiryUtc = parseExpiryDateUtcMidnight(expiryDateStr);
  const refUtc = parseUtcMidnight(referenceDateInput);
  const daysUntilExpiry = Math.round((expiryUtc - refUtc) / MS_PER_DAY);

  return {
    expiry_date: expiryDateStr,
    is_expired: daysUntilExpiry <= 0,
    days_until_expiry: daysUntilExpiry,
  };
};
