/**
 * Currency and minor units formatting utilities for PharmacyFlow POS UI.
 * 
 * Money in PharmacyFlow is strictly integer minor units (kobo for NGN, cents for USD).
 * 100 minor units = 1 major unit (e.g. 100 kobo = 1.00 NGN).
 */

export const formatMinorUnits = (amount: number, currency: string = 'NGN'): string => {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? Math.floor(amount) : 0;
  const major = (safeAmount / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  switch (currency.toUpperCase()) {
    case 'NGN':
      return `₦${major}`;
    case 'USD':
      return `$${major}`;
    case 'EUR':
      return `€${major}`;
    case 'GBP':
      return `£${major}`;
    default:
      return `${currency} ${major}`;
  }
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
  } catch {
    return dateStr;
  }
};
