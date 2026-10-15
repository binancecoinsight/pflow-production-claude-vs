/**
 * PharmacyFlow Reports Domain Formatting & Preset Utilities (Phase 5D-20)
 */

import { ReportDatePreset, ReportDateRange } from './types';
import { formatMinorUnits } from '../../components/pos/formatters';

export const MASKED_FINANCIAL_VALUE = '••••••';

/**
 * Formats integer minor units with optional role-based financial masking.
 */
export function formatReportCurrency(
  minorUnits: number | null | undefined,
  isMasked: boolean = false,
  currency: string = 'NGN'
): string {
  if (isMasked) {
    return MASKED_FINANCIAL_VALUE;
  }
  return formatMinorUnits(minorUnits || 0, currency);
}

/**
 * Formats percentage value with optional financial masking.
 */
export function formatReportPercent(
  pct: number | null | undefined,
  isMasked: boolean = false
): string {
  if (isMasked) {
    return MASKED_FINANCIAL_VALUE;
  }
  const safe = typeof pct === 'number' && !isNaN(pct) ? pct : 0;
  return `${safe.toFixed(1)}%`;
}

/**
 * Generates ISO UTC range for a given date preset.
 * Boundaries are strictly set to 00:00:00.000Z and 23:59:59.999Z.
 */
export function computeDateRange(
  preset: ReportDatePreset,
  customStart?: string,
  customEnd?: string,
  referenceNow: Date = new Date()
): ReportDateRange {
  const end = new Date(referenceNow);
  const start = new Date(referenceNow);

  if (preset === 'TODAY') {
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else if (preset === '7D') {
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else if (preset === '30D') {
    start.setUTCDate(start.getUTCDate() - 29);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else if (preset === 'CUSTOM') {
    if (customStart) {
      const s = new Date(customStart);
      s.setUTCHours(0, 0, 0, 0);
      start.setTime(s.getTime());
    } else {
      start.setUTCDate(start.getUTCDate() - 29);
      start.setUTCHours(0, 0, 0, 0);
    }

    if (customEnd) {
      const e = new Date(customEnd);
      e.setUTCHours(23, 59, 59, 999);
      end.setTime(e.getTime());
    } else {
      end.setUTCHours(23, 59, 59, 999);
    }
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    preset
  };
}
