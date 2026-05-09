/**
 * User message — Inter 500, left 2px muted bar (PRD §13.2 "user vs
 * agent three-way distinction"). NOT a chat bubble; this is a document.
 *
 * Per DESIGN.md §4.3:
 *   - font-sans 15px medium
 *   - left border 2px text-ink-muted
 *   - left padding 16px from the bar
 *
 * `data-role="user-msg"` is a stable anchor that MainView's scroll
 * effect uses to find the just-submitted user message and snap its
 * top edge to ~32px below the viewport top. Don't rename without
 * updating MainView's selector.
 */
export function MessageUser({ content }: { content: string }) {
  return (
    <div
      data-role="user-msg"
      className="my-4 border-l-2 border-ink-muted py-1 pl-4 text-[15px] font-medium leading-[1.65] text-ink"
    >
      {content}
    </div>
  );
}
