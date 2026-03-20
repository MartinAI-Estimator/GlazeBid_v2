/**
 * MeasurementInput.tsx  —  Architectural dimension text input.
 *
 * Glaziers type strings like "10'-2 1/2"", "84 1/2", or "122".
 * This component:
 *   - Displays the current value as a fractional-inch string (e.g. "84 1/2"")
 *   - On focus the user can type any architectural string
 *   - On blur / Enter, parses it to decimal inches, snaps to nearest 1/16",
 *     and calls onCommit with the decimal inch value
 *   - On Escape reverts to the last good value
 */

import { useState, useEffect, useRef } from 'react';
import {
  parseArchitecturalString,
  formatArchitecturalInches,
} from '../../utils/measurementParser';

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  /** Current value in decimal inches */
  value:       number;
  /** Called with the new decimal-inch value after the user commits */
  onCommit:    (inches: number) => void;
  placeholder?: string;
  className?:   string;
  disabled?:    boolean;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MeasurementInput({
  value,
  onCommit,
  placeholder,
  className,
  disabled,
}: Props): React.ReactElement {
  const display  = formatArchitecturalInches(value, 'inches');
  const [draft,   setDraft]   = useState(display);
  const focusRef  = useRef(false);

  // Keep draft in sync with external value changes while the input is not focused
  useEffect(() => {
    if (!focusRef.current) setDraft(formatArchitecturalInches(value, 'inches'));
  }, [value]);

  function commit() {
    focusRef.current = false;
    const parsed = parseArchitecturalString(draft);
    if (isFinite(parsed) && parsed > 0) {
      onCommit(parsed);
      // Immediately reformat so the input shows e.g. "84 1/2"" not "84.5"
      setDraft(formatArchitecturalInches(parsed, 'inches'));
    } else {
      // Revert to last known-good display
      setDraft(formatArchitecturalInches(value, 'inches'));
    }
  }

  return (
    <input
      type="text"
      disabled={disabled}
      value={draft}
      placeholder={placeholder ?? '84 1/2"'}
      onChange={e => setDraft(e.target.value)}
      onFocus={() => {
        focusRef.current = true;
        // Select all text on focus so the user can type immediately
        // (handled by browser default — no extra work needed)
      }}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') {
          focusRef.current = false;
          setDraft(formatArchitecturalInches(value, 'inches'));
        }
      }}
      className={
        className ??
        'w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 ' +
        'focus:outline-none focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed ' +
        'placeholder:text-slate-600'
      }
    />
  );
}
