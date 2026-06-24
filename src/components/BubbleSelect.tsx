import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type BubbleSelectOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
};

type BubbleSelectProps<T extends string | number> = {
  value?: T;
  options: BubbleSelectOption<T>[];
  onChange: (value: T | undefined) => void;
  placeholder?: string;
  ariaLabel: string;
  tone?: "neutral" | "mint" | "lilac" | "pink" | "butter";
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
};

export function BubbleSelect<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = "Choose one",
  ariaLabel,
  tone = "neutral",
  allowEmpty = false,
  emptyLabel = "None",
  className
}: BubbleSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const label = selected?.label ?? (allowEmpty && value === undefined ? emptyLabel : placeholder);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(next?: T) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className={`bubble-select ${tone}${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="bubble-select-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={selected || (allowEmpty && value === undefined) ? "bubble-select-value" : "bubble-select-placeholder"}>
          {label}
        </span>
        <ChevronDown aria-hidden="true" className={open ? "bubble-select-chevron is-open" : "bubble-select-chevron"} size={16} />
      </button>

      {open ? (
        <ul className="bubble-select-menu" id={listId} role="listbox">
          {allowEmpty ? (
            <li role="presentation">
              <button
                className={value === undefined ? "bubble-select-option is-selected" : "bubble-select-option"}
                onClick={() => pick(undefined)}
                role="option"
                aria-selected={value === undefined}
                type="button"
              >
                {emptyLabel}
              </button>
            </li>
          ) : null}
          {options.map((option) => (
            <li key={String(option.value)} role="presentation">
              <button
                className={option.value === value ? "bubble-select-option is-selected" : "bubble-select-option"}
                onClick={() => pick(option.value)}
                role="option"
                aria-selected={option.value === value}
                type="button"
              >
                <span>{option.label}</span>
                {option.hint ? <span className="bubble-select-hint">{option.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
