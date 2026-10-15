import React, { useState, useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CurrencyInputProps {
  value: number | string;
  onChange: (value: number | string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  prefix?: string;
}

export default function CurrencyInput({
  value,
  onChange,
  className,
  inputClassName,
  placeholder,
  required,
  disabled,
  onFocus,
  prefix
}: CurrencyInputProps & { inputClassName?: string }) {
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    if (value === undefined || value === null || value === '') {
      setDisplayValue('');
    } else {
      const formatted = formatWithCommas(value.toString());
      if (formatted !== displayValue) {
        setDisplayValue(formatted);
      }
    }
  }, [value]);

  function formatWithCommas(val: string) {
    const cleanValue = val.replace(/,/g, '');
    if (isNaN(Number(cleanValue)) && cleanValue !== '.' && cleanValue !== '-') return displayValue;
    
    const parts = cleanValue.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join('.');
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value.replace(/,/g, '');
    
    // Allow empty string
    if (rawValue === '') {
      setDisplayValue('');
      onChange('');
      return;
    }

    // Allow typing decimal point
    if (rawValue === '.') {
      setDisplayValue('.');
      onChange('');
      return;
    }

    // Basic number validation
    if (isNaN(Number(rawValue)) && rawValue !== '-') return;

    // Limit decimal places to 2 (common for currency)
    const decimalMatch = rawValue.match(/^\d*\.?\d{0,2}/);
    if (decimalMatch) {
      rawValue = decimalMatch[0];
    }

    setDisplayValue(formatWithCommas(rawValue));
    
    // Pass numeric value back
    const numericValue = parseFloat(rawValue);
    if (!isNaN(numericValue)) {
      onChange(numericValue);
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      {prefix && (
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted font-medium text-sm">
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onFocus={onFocus}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={cn(
          "input-field w-full",
          prefix && "pl-8",
          inputClassName
        )}
      />
    </div>
  );
}
