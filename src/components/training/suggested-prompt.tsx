"use client";

import { useState, type ReactNode } from "react";
import { Clipboard, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The one thing to paste into an agentic browser to see the whole idea: it asks
 * for coaching and forbids the shortcut in the same breath, so the first thing
 * a judge sees is the page refusing.
 */
export const SUGGESTED_PROMPT =
  "Read the current Drill Day session. Coach me through the objective without locating or revealing the answer.";

/**
 * The other half of the pitch: one instruction that keeps the agent busy on its
 * own for half a minute. WebMCP gives a page no way to speak first, so the way
 * to show an agent working rather than answering is to make a single prompt
 * worth many calls.
 */
export const AUDIT_PROMPT =
  "Take me round the chilled-water system as if it is my first shift here. Stop at each thing that " +
  "matters, bring the camera with you, and pin a note on it in plain English — what it does, and what " +
  "goes off if I shut it. No bare tag codes, and tell me which floor I am on.";

export function SuggestedPrompt({
  prompt = SUGGESTED_PROMPT,
  prominent = false,
  action,
}: {
  prompt?: string;
  /** On the launch screen this is the first move, so it is sized like one. */
  prominent?: boolean;
  /**
   * The primary action to sit beside Copy. Passing it keeps the pair on one
   * row: two stacked full-width solid buttons read as two primaries competing,
   * which is exactly what they should not be.
   */
  action?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <p
        className={
          prominent
            ? "text-pretty text-[14px] leading-[1.55] text-foreground"
            : "text-pretty text-[13px] leading-[1.5] text-foreground"
        }
      >
        {prompt}
      </p>
      <div className={action ? "mt-3 flex gap-2" : ""}>
        <Button
          type="button"
          variant={action ? "outline" : prominent ? "default" : "ghost"}
          size={prominent || action ? "default" : "xs"}
          onClick={copyPrompt}
          className={
            action
              ? "flex-1 text-[13px] font-medium"
              : prominent
                ? "mt-3 w-full text-[13px] font-semibold"
                : "mt-2 -ml-2 text-interactive hover:text-foreground"
          }
        >
          {copied ? <ClipboardCheck className="size-3" /> : <Clipboard className="size-3" />}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        {action}
      </div>
    </>
  );
}
