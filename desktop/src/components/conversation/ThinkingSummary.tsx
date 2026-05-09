import { type ReactNode } from "react";

import { MarkdownView } from "@/components/conversation/MarkdownView";

/**
 * Thinking summary — opens an agent turn. Per DESIGN.md §4.3:
 *
 *   - 💭 emoji anchor (the deliberate emoji exception in our
 *     otherwise Phosphor-only icon set)
 *   - font-serif italic 14px text register
 *   - 3px apricot left bar + 6% apricot tint background — adds the
 *     "this is the lead, not just commentary" weight
 *
 * Markdown rendering: a `string` child runs through MarkdownView
 * with the "thinking" variant (italic serif muted register;
 * markdown elements still resolve, so a thinking summary that does
 * include `code` / lists / etc. reads correctly). ReactNode children
 * pass through verbatim (the "思考中…" placeholder, demo fixtures).
 */
export function ThinkingSummary({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 flex items-start gap-2.5 rounded-r-[8px] border-l-[3px] border-brand bg-brand/[0.06] px-3.5 py-2.5">
      <span className="text-[14px] leading-none">💭</span>
      <div className="min-w-0 flex-1">
        {typeof children === "string" ? (
          <MarkdownView source={children} variant="thinking" />
        ) : (
          <span className="font-serif text-[14px] italic leading-[1.55] text-ink-soft">
            {children}
          </span>
        )}
      </div>
    </div>
  );
}
