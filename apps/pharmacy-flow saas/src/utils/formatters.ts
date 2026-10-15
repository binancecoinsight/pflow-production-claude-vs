
export const formatCurrency = (amount: number, symbol: string = '₦') => {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  return `${isNegative ? '-' : ''}${symbol}${absAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatNumber = (num: number) => {
  return num.toLocaleString(undefined);
};
