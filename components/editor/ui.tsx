"use client";

import type { ComponentType, ReactNode } from "react";

/**
 * The editor's own hardware. Three rules hold the whole page together, the
 * same three the public pages use: every border is 2px of pure black, every
 * shadow is an offset with no blur, and a pressed control is filled black.
 */

export function Tick({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`tick ${className}`}>{children}</span>;
}

/** A labelled block inside a drawer. */
export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Tick className="mb-2 block">{label}</Tick>
      {children}
    </div>
  );
}

interface Option<T> {
  value: T;
  label?: string;
  icon?: ComponentType<{ size?: number | string; className?: string }>;
  title?: string;
}

/** A row of choices sharing one black box; the held one is filled. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: Array<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex border-2 border-edge bg-white">
      {options.map((option, index) => {
        const held = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={held}
            title={option.title ?? option.label}
            onClick={() => onChange(option.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              size === "sm" ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-[12px]"
            } ${index > 0 ? "border-l-2 border-edge" : ""} ${
              held ? "bg-edge text-bone" : "text-ink hover:bg-bone"
            }`}
          >
            {Icon ? <Icon size={13} /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A bordered button that lifts under the pointer and takes the press. */
export function SlabButton({
  children,
  onClick,
  disabled,
  tone = "plain",
  title,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "plain" | "solid";
  title?: string;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`slab-tight press flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${
        tone === "solid" ? "bg-edge text-bone" : "bg-white text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** One colour, shown as the pair an ink actually is: a wash inside its stroke. */
export function Swatch({
  color,
  tint,
  held,
  title,
  onClick,
}: {
  color: string;
  tint: string;
  held: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={held}
      onClick={onClick}
      className={`h-7 w-7 border-2 transition-transform ${
        held ? "outline outline-2 outline-offset-2 outline-edge" : "hover:-translate-y-0.5"
      }`}
      style={{ backgroundColor: tint, borderColor: color }}
    />
  );
}
