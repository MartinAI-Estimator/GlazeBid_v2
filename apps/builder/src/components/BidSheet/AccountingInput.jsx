import { useState } from 'react';

/**
 * AccountingInput
 *
 * A controlled number input that behaves like an accounting cell:
 *   • Displays a comma-formatted value when not focused  (e.g. "12,345.67")
 *   • Switches to the raw decimal string while the user is editing
 *   • Strips non-numeric characters on input
 *   • Calls onChange(Number) on every keystroke AND on blur
 *
 * Props:
 *   value       – current numeric value (number)
 *   onChange    – (num: number) => void
 *   placeholder – shown when the field is empty (default "0.00")
 *   style       – style object forwarded to <input>
 *   All other props forwarded to <input> (className, data-*, etc.)
 */
export default function AccountingInput({
  value,
  onChange,
  placeholder = '0.00',
  style,
  onFocus: externalOnFocus,
  onBlur: externalOnBlur,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  // Format a number in accounting locale (commas + 2dp)
  const fmt = (num) => {
    const n = (typeof num === 'number' && !isNaN(num)) ? num : (parseFloat(num) || 0);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const displayValue = focused
    ? raw
    : (value != null && value !== '' && Number(value) !== 0 ? fmt(value) : '');

  const handleFocus = (e) => {
    const n = parseFloat(value) || 0;
    setRaw(n === 0 ? '' : String(n));
    setFocused(true);
    externalOnFocus && externalOnFocus(e);
  };

  const handleChange = (e) => {
    // Allow digits and a single decimal point only
    const cleaned = e.target.value
      .replace(/[^0-9.]/g, '')
      .replace(/(\..*)\./g, '$1');
    setRaw(cleaned);
    onChange(parseFloat(cleaned) || 0);
  };

  const handleBlur = (e) => {
    setFocused(false);
    const parsed = parseFloat(raw) || 0;
    setRaw('');
    onChange(parsed);
    externalOnBlur && externalOnBlur(e);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder={placeholder}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      style={style}
      {...rest}
    />
  );
}
