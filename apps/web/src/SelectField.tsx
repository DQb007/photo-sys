import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectFieldProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SelectField({ label, value, options, onChange, disabled = false, className = '' }: SelectFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const selected = options.find((item) => item.value === value) || options[0];

  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
  }

  function moveSelection(direction: 1 | -1) {
    const currentIndex = Math.max(0, options.findIndex((item) => item.value === value));
    const nextIndex = Math.min(options.length - 1, Math.max(0, currentIndex + direction));
    choose(options[nextIndex].value);
  }

  return (
    <div className={className ? `selectField ${className}` : 'selectField'} ref={rootRef}>
      {label && <span className="selectLabel">{label}</span>}
      <button
        className="selectTrigger"
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!isOpen) setIsOpen(true);
            else moveSelection(1);
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) setIsOpen(true);
            else moveSelection(-1);
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen((current) => !current);
          }
        }}
      >
        <span>{selected?.label || '请选择'}</span>
        <ChevronDown size={16} />
      </button>
      {isOpen && !disabled && (
        <div className="selectMenu" id={listboxId} role="listbox">
          {options.map((item) => (
            <button
              key={item.value}
              className={item.value === value ? 'selectOption active' : 'selectOption'}
              type="button"
              role="option"
              aria-selected={item.value === value}
              onClick={() => choose(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
