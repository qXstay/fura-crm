"use client";

import { useEffect, useId, useRef, useState } from "react";
import { hintLabel, suggestCities, type CityHint } from "@/lib/geo";
import { cx } from "./ui";
import { Icon } from "./icons";

/**
 * Город с подсказками. Порядок: города по величине, деревни и посёлки с тем же именем только ниже всех городов.
 * Enter берёт подсвеченную строку, а первой всегда стоит город.
 */
export function CityInput({ value, onChange, placeholder, label, testId, className, autoFocus }: { value: string; onChange: (city: string, hint: CityHint | null) => void; placeholder?: string; label: string; testId?: string; className?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setText(value), [value]);
  const hints = open ? suggestCities(text, 8) : [];
  const choose = (h: CityHint | null) => {
    if (!h) {
      setText("");
      onChange("", null);
    } else {
      setText(h.city);
      onChange(h.city, h);
    }
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) {
        setOpen(false);
        setText(value);
      }
    };
    document.addEventListener("mousedown", down);
    return () => document.removeEventListener("mousedown", down);
  }, [open, value]);
  return (
    <div ref={box} className={cx("relative min-w-0", className)}>
      <input
        className={cx("field max-sm:placeholder:text-[13px]", text && "pr-7")}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        data-testid={testId}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (!e.target.value) onChange("", null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hints.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && hints[active]) {
              e.preventDefault();
              choose(hints[active]);
            }
          } else if (e.key === "Escape") {
            if (open) {
              e.stopPropagation();
              setOpen(false);
              setText(value);
            }
          }
        }}
      />
      {text && (
        <button type="button" aria-label="Очистить" className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-[var(--ink-3)] hover:text-[var(--ink)]" onClick={() => choose(null)}>
          <Icon name="x" size={12} />
        </button>
      )}
      {open && hints.length > 0 && (
        <ul id={listId} role="listbox" className="pop anim-pop absolute left-0 right-0 top-[calc(100%+4px)] z-[65] max-h-72 min-w-[240px] overflow-auto p-1" data-testid={testId ? `${testId}-list` : undefined}>
          {hints.map((h, i) => (
            <li key={`${h.city}-${h.region}-${h.kind}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className="menu-item"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(h);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className={cx(h.kind === "г." ? "font-medium" : "text-[var(--ink-2)]")}>{hintLabel(h)}</span>
                  <span className="ml-1.5 text-[12px] text-[var(--ink-3)]">
                    {h.region !== h.city ? `${h.region}, ` : ""}
                    {h.country === "RU" ? "Россия" : "Беларусь"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
