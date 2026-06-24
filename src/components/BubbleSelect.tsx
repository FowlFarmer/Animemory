import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

let openSelectId: string | null = null;
const openListeners = new Set<(id: string | null) => void>();

function setGlobalOpenId(id: string | null) {
  openSelectId = id;
  openListeners.forEach((listener) => listener(id));
}

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
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const instanceId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const label = selected?.label ?? (allowEmpty && value === undefined ? emptyLabel : placeholder);

  useEffect(() => {
    function onGlobalOpen(id: string | null) {
      if (id !== instanceId) setOpen(false);
    }

    openListeners.add(onGlobalOpen);
    return () => {
      openListeners.delete(onGlobalOpen);
      if (openSelectId === instanceId) setGlobalOpenId(null);
    };
  }, [instanceId]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuRect(null);
      return;
    }

    function updateMenuRect() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuRect({
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width
      });
    }

    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setGlobalOpenId(null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setGlobalOpenId(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setGlobalOpenId(null);
  }

  function toggleOpen() {
    if (open) {
      close();
      return;
    }
    setGlobalOpenId(instanceId);
    setOpen(true);
  }

  function pick(next?: T) {
    onChange(next);
    close();
  }

  const menu =
    open && menuRect ? (
      <ul
        className={`bubble-select-menu is-portal ${tone}`}
        id={listId}
        ref={menuRef}
        role="listbox"
        style={{
          position: "fixed",
          top: menuRect.top,
          left: menuRect.left,
          width: menuRect.width,
          zIndex: 10000
        }}
      >
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
    ) : null;

  return (
    <div
      className={`bubble-select ${tone}${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <button
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="bubble-select-trigger"
        onClick={toggleOpen}
        ref={triggerRef}
        type="button"
      >
        <span className={selected || (allowEmpty && value === undefined) ? "bubble-select-value" : "bubble-select-placeholder"}>
          {label}
        </span>
        <ChevronDown aria-hidden="true" className={open ? "bubble-select-chevron is-open" : "bubble-select-chevron"} size={16} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
