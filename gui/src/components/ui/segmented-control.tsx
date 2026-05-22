import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type SegmentedControlSize = "sm" | "md";

export interface SegmentedControlOption<TValue extends string> {
  value: TValue;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface SegmentedControlProps<TValue extends string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: TValue;
  options: readonly SegmentedControlOption<TValue>[];
  onValueChange?: (value: TValue) => void;
  ariaLabel: string;
  size?: SegmentedControlSize;
}

const ITEM_SIZE_CLASSES: Record<SegmentedControlSize, string> = {
  sm: "h-6 gap-1 px-2 text-[12px]",
  md: "h-7 gap-1.5 px-2.5 text-[12.5px]",
};

export function SegmentedControl<TValue extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  size = "md",
  className,
  ...rest
}: SegmentedControlProps<TValue>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-sm border border-line bg-surface p-0.5",
        className,
      )}
      {...rest}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            disabled={option.disabled}
            onClick={() => {
              if (!option.disabled && !active) onValueChange?.(option.value);
            }}
            className={cn(
              "inline-flex select-none items-center justify-center rounded-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              "disabled:cursor-not-allowed disabled:opacity-40",
              ITEM_SIZE_CLASSES[size],
              active
                ? "bg-elevated text-ink shadow-card"
                : "text-ink-soft hover:bg-hover hover:text-ink",
            )}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
