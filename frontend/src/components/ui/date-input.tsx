'use client';

import { useRef, useState, useEffect } from 'react';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface DateInputProps {
  value?: string; // ISO date string yyyy-mm-dd (or empty)
  onChange?: (value: string) => void; // emits yyyy-mm-dd or ''
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

// Convert ISO yyyy-mm-dd → display dd/mm/yyyy
function isoToDisplay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Convert display dd/mm/yyyy → ISO yyyy-mm-dd (or '' if invalid)
function displayToIso(display: string): string {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  const [, day, month, year] = m;
  const d = Number(day), mo = Number(month), y = Number(year);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return '';
  return `${year}-${month}-${day}`;
}

// Rebuild the dd/mm/yyyy mask from raw digits (up to 8)
function digitsToDisplay(digits: string): string {
  const d = digits.slice(0, 8);
  let out = '';
  for (let i = 0; i < d.length; i++) {
    if (i === 2 || i === 4) out += '/';
    out += d[i];
  }
  return out;
}

export function DateInput({ value, onChange, placeholder = 'dd/mm/yyyy', disabled, className, id }: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value || ''));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when external value changes (form reset, defaultValues injection)
  useEffect(() => {
    setDisplay(isoToDisplay(value || ''));
  }, [value]);

  function commit(newDisplay: string) {
    setDisplay(newDisplay);
    const iso = displayToIso(newDisplay);
    onChange?.(iso);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Extract only digits and rebuild the mask
    const digits = raw.replace(/\D/g, '');
    const formatted = digitsToDisplay(digits);
    const cursorPos = formatted.length;
    commit(formatted);
    // Move cursor to end after state update
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Allow navigation and system keys
    if (e.ctrlKey || e.metaKey) return;
    if (['Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      const input = inputRef.current;
      if (!input) return;
      const pos = input.selectionStart ?? display.length;
      if (pos === 0) return;

      let newDisplay: string;
      let newPos: number;

      // If cursor is right after a slash, skip the slash and remove the digit before it
      if (display[pos - 1] === '/') {
        newDisplay = display.slice(0, pos - 2) + display.slice(pos);
        newPos = Math.max(0, pos - 2);
      } else {
        newDisplay = display.slice(0, pos - 1) + display.slice(pos);
        newPos = Math.max(0, pos - 1);
      }

      // Re-format after deletion to keep the mask consistent
      const digits = newDisplay.replace(/\D/g, '');
      const formatted = digitsToDisplay(digits);
      commit(formatted);
      const finalPos = Math.min(newPos, formatted.length);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(finalPos, finalPos);
        }
      });
      return;
    }

    // Block non-digit, non-slash keys
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData('text');

    // ISO yyyy-mm-dd → convert to display
    const isoM = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoM) {
      const disp = `${isoM[3]}/${isoM[2]}/${isoM[1]}`;
      commit(disp);
      return;
    }

    // dd/mm/yyyy already formatted
    const dmyM = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dmyM) {
      commit(text);
      return;
    }

    // Fallback: extract digits and mask
    const digits = text.replace(/\D/g, '');
    if (digits) commit(digitsToDisplay(digits));
  }

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      value={display}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(className)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      maxLength={10}
      autoComplete="off"
    />
  );
}
