import { Fragment } from "react";

import { MessageAgent } from "@/components/conversation/MessageAgent";
import { MessageUser } from "@/components/conversation/MessageUser";
import { ThinkingSummary } from "@/components/conversation/ThinkingSummary";
import { ToolCallout } from "@/components/conversation/ToolCallout";
import type { AgentTurn, Turn } from "@/types/conversation";
import type { ApprovalDecision } from "@/types/ipc";

export interface ConversationProps {
  turns: Turn[];
  /** Map of approvalId -> recorded decision. When a tool's
   * approvalId is in this map its callout flips to the decided pill. */
  approvalDecisions?: Record<string, ApprovalDecision>;
  /** Decision callback. Receives the approval id and the user's choice. */
  onApprove?: (approvalId: string, decision: ApprovalDecision) => void;
}

/**
 * The conversation document — user turns, agent turns, and the two
 * horizontal-rule rhythms that DESIGN.md §4.3 codifies:
 *
 *   - hr-strong  : full-width, at end of agent turn before finalAnswer.
 *                  "Result-first" rhythm — separates plan/execution from
 *                  conclusion.
 *   - hr-soft    : 60% centered, between turns. Quiet pacing.
 *
 * Both kinds use --color-line; the strong one uses line-strong width
 * via the visual contrast of full-width vs 60% rather than a different
 * color. (DESIGN.md says "稍深 1px 全宽 vs 极淡 1px 60% 居中"; opacity
 * 60% on the soft one approximates the prototype.)
 */
export function Conversation({
  turns,
  approvalDecisions,
  onApprove,
}: ConversationProps) {
  return (
    <div>
      {turns.map((t, i) => (
        <Fragment key={i}>
          {t.role === "user" ? (
            <MessageUser content={t.content} />
          ) : (
            <AgentTurnView
              turn={t}
              approvalDecisions={approvalDecisions}
              onApprove={onApprove}
            />
          )}
          {/* SoftHr separates turns. The label is the *next* turn's
              number — the divider visually announces "Turn N below".
              First turn gets no marker (it's already on screen). */}
          {i < turns.length - 1 && <SoftHr label={`Turn ${i + 2}`} />}
        </Fragment>
      ))}
    </div>
  );
}

function AgentTurnView({
  turn,
  approvalDecisions,
  onApprove,
}: {
  turn: AgentTurn;
  approvalDecisions?: Record<string, ApprovalDecision>;
  onApprove?: (approvalId: string, decision: ApprovalDecision) => void;
}) {
  const showFinalAnswer = turn.finalAnswer !== null;

  return (
    <div>
      {turn.thinking && <ThinkingSummary>{turn.thinking}</ThinkingSummary>}

      {turn.tools.map((tool) => (
        <ToolCallout
          key={tool.id}
          tool={tool}
          approvalDecision={
            tool.approvalId ? approvalDecisions?.[tool.approvalId] : undefined
          }
          onApprove={(decision) => {
            if (tool.approvalId) onApprove?.(tool.approvalId, decision);
          }}
        />
      ))}

      {showFinalAnswer && (
        <>
          <StrongHr />
          <MessageAgent>{turn.finalAnswer}</MessageAgent>
        </>
      )}
    </div>
  );
}

function StrongHr() {
  return (
    <hr className="my-4 border-0 border-t border-line-strong" aria-hidden />
  );
}

/**
 * Turn-divider rule. With a `label`, splits into two short rules
 * with the label centered between them ("──── Turn 2 ────"); the
 * label is the next turn's number, giving the conversation chapter-
 * style waypoints. Without a label (legacy callers) the rule is
 * unbroken, mirroring the v0.1 prototype.
 *
 * Spacing: `my-6` (48px). Earlier `my-9` (72px) felt too sparse
 * during dogfood — DESIGN.md §4.3 documents the change rationale.
 */
function SoftHr({ label }: { label?: string } = {}) {
  if (!label) {
    return (
      <hr
        className="mx-[12%] my-6 border-0 border-t border-line opacity-60"
        aria-hidden
      />
    );
  }
  return (
    <div
      className="mx-[12%] my-6 flex items-center gap-3 text-[11px] text-ink-muted"
      role="separator"
      aria-label={label}
    >
      <span className="h-px flex-1 bg-line opacity-60" aria-hidden />
      <span className="shrink-0 font-mono uppercase tracking-[0.08em]">
        {label}
      </span>
      <span className="h-px flex-1 bg-line opacity-60" aria-hidden />
    </div>
  );
}
