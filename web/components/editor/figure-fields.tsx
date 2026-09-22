"use client";

import { useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Field, SlabButton } from "@/components/editor/ui";

/**
 * The controls every figure's panel is built from.
 *
 * Not diagram logic — a number field is a number field. Each figure decides
 * what it offers and what those settings mean; this is only the hardware they
 * are all made of, so a mind map and a pie chart feel like the same editor.
 */

const round = (value: number) => Math.round(value * 1000) / 1000;

/** A field that holds what is being typed and hands over only what parses. */
export function NumberField({
  value,
  onCommit,
  title,
  width = "w-full",
}: {
  value: number;
  onCommit: (value: number) => void;
  title?: string;
  width?: string;
}) {
  const [draft, setDraft] = useState(String(round(value)));
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(String(round(value)));
  }
  return (
    <input
      value={draft}
      title={title}
      aria-label={title}
      inputMode="decimal"
      spellCheck={false}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const parsed = Number(next);
        if (next.trim() !== "" && Number.isFinite(parsed)) {
          onCommit(parsed);
        }
      }}
      onBlur={() => setDraft(String(round(value)))}
      className={`${width} border-2 border-edge bg-white px-1.5 py-1 text-right font-mono text-[11.5px] text-ink`}
    />
  );
}

/** A caption field that hands over what was typed when the reader leaves it. */
export function TextField({
  value,
  onCommit,
  title,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  title?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  return (
    <input
      value={draft}
      title={title}
      aria-label={title}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onCommit(draft);
          (event.target as HTMLInputElement).blur();
        }
      }}
      className="w-full min-w-0 border-2 border-edge bg-white px-1.5 py-1 font-mono text-[11.5px] text-ink"
    />
  );
}

/** A short list to pick one thing from: a participant, a kind of message. */
export function Picker<T extends string>({
  value,
  options,
  onChange,
  title,
  className = "",
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  title?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      title={title}
      aria-label={title}
      onChange={(event) => onChange(event.target.value as T)}
      className={`min-w-0 border-2 border-edge bg-white px-1 py-1 font-mono text-[11.5px] text-ink ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ColourDot({
  colour,
  onPick,
  title,
}: {
  colour: string;
  onPick: (colour: string) => void;
  title: string;
}) {
  return (
    <label
      title={title}
      className="relative block h-6 w-6 shrink-0 cursor-pointer border-2 border-edge"
      style={{ backgroundColor: colour }}
    >
      <input
        type="color"
        value={colour}
        onChange={(event) => onPick(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={title}
      />
    </label>
  );
}

export function IconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-[26px] w-[26px] shrink-0 place-items-center border-2 border-edge bg-white text-ink transition-colors ${
        danger ? "hover:bg-alert-tint hover:text-alert" : "hover:bg-bone"
      }`}
    >
      {children}
    </button>
  );
}

/** A grid of named choices, one of them held. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: Array<{ id: T; name: string; hint?: string }>;
  value: T;
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={`grid gap-1.5 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {options.map((entry) => {
        const held = entry.id === value;
        return (
          <button
            key={entry.id}
            type="button"
            aria-pressed={held}
            title={entry.hint ?? entry.name}
            onClick={() => onChange(entry.id)}
            className={`border-2 border-edge px-2 py-1.5 text-left font-mono text-[11.5px] transition-colors ${
              held ? "bg-edge text-bone" : "bg-white text-ink hover:bg-bone"
            }`}
          >
            {entry.name}
          </button>
        );
      })}
    </div>
  );
}

/** A slider with its value written beside it. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-[52px] shrink-0 font-mono text-[11.5px] text-ink">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 flex-1 accent-edge"
        aria-label={label}
      />
      <span className="w-10 shrink-0 text-right font-mono text-[11px] text-ink-faint">
        {format ? format(value) : value}
      </span>
    </label>
  );
}

/** How big the figure is drawn. Every figure can be sized, so every panel has it. */
export function SizeField({
  width,
  height,
  onChange,
  note,
}: {
  width: number;
  height: number;
  onChange: (size: { width: number; height: number }) => void;
  note?: string;
}) {
  return (
    <Field label="Size" className="border-t-2 border-edge p-3">
      <div className="flex items-center gap-1.5">
        <NumberField
          value={width}
          width="w-[72px]"
          title="How wide it is drawn"
          onCommit={(value) =>
            onChange({ width: Math.max(160, Math.min(2400, value)), height })
          }
        />
        <span className="font-mono text-[11px] text-ink-faint">×</span>
        <NumberField
          value={height}
          width="w-[72px]"
          title="How tall it is drawn"
          onCommit={(value) =>
            onChange({ width, height: Math.max(120, Math.min(2400, value)) })
          }
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        {note ??
          "It can also be dragged to size on the sheet; it is drawn again at whatever size it is let go of."}
      </p>
    </Field>
  );
}

/**
 * Back to the drawing the notation starts with.
 *
 * It throws away everything on the figure, so it asks once: the first press
 * only arms it, and it disarms itself if the reader goes elsewhere.
 */
export function ResetButton({ what, onReset }: { what: string; onReset: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <div className="border-t-2 border-edge bg-bone p-3">
      <SlabButton
        className="w-full"
        tone={armed ? "solid" : "plain"}
        title={`Put this ${what} back to the one it started as`}
        onClick={() => {
          if (armed) {
            onReset();
            setArmed(false);
          } else {
            setArmed(true);
          }
        }}
        onBlur={() => setArmed(false)}
      >
        <RotateCcw size={13} />
        {armed ? `Press again to reset the ${what}` : `Reset this ${what}`}
      </SlabButton>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        Everything set here goes back to the {what} this notation opens with.
      </p>
    </div>
  );
}
