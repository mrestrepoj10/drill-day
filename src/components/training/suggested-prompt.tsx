"use client";

import { useState, type ReactNode } from "react";
import { Clipboard, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The one thing to paste into an agentic browser to see the whole idea: it asks
 * for coaching and forbids the shortcut in the same breath, so the first thing
 * a judge sees is the page refusing.
 *
 * Starting is conditional rather than unconditional, and the condition is "no
 * mission", not "not running". There are seven roles, and a finished drill
 * reports `complete` while keeping its mission and its debrief — so asking an
 * agent to start whenever nothing is *running* would have it wipe the
 * firefighter debrief someone was reading. Only an untouched session has no
 * mission at all, and that is the one case where starting is safe.
 */
export const SUGGESTED_PROMPT =
  "Read the current Drill Day session. If it has no mission yet, start the technician one. " +
  "Then coach me through the objective without locating or revealing the answer.";

/**
 * The other half of the pitch: one instruction that keeps the agent busy on its
 * own for a couple of minutes. WebMCP gives a page no way to speak first, so
 * the way to show an agent working rather than answering is to make a single
 * prompt worth many calls.
 *
 * "Shift handover" is doing real work in that sentence. It is a job people
 * already know how to do, so the agent produces a briefing rather than a list,
 * and everything after it exists because the briefing was worse without it:
 * plain English over tag codes, and the floor named, because a note that reads
 * "V-CHW-214" is a note nobody can act on.
 */
export const AUDIT_PROMPT =
  "Walk the chilled-water system in this building and brief me the way you would at a shift handover. " +
  "Pin a note on anything I should know before I touch a valve — what it does, and what goes off if I " +
  "shut it. Plain English, no bare tag codes, and tell me which floor I am on.";

/**
 * The two ways to hand the page to an agent, as the launch card offers them.
 *
 * They are genuinely different sessions rather than two phrasings of one, which
 * is why they get a switch instead of a list: one asks the agent to coach
 * inside a scored drill and runs into the guardrails, the other asks it to work
 * unsupervised with no drill at all. Showing both at once made the card the
 * loudest thing on the screen; showing one at a time keeps the card the size it
 * was and still says there is more than one shape of session here.
 */
export const AGENT_PROMPTS = [
  {
    id: "coach",
    label: "Coach me",
    prompt: SUGGESTED_PROMPT,
    note: "Either order. Your agent reads the live session, and starts a drill only if you have not picked one.",
  },
  {
    id: "brief",
    label: "Brief me",
    prompt: AUDIT_PROMPT,
    note: "No drill needed. It walks the building on its own and pins what it finds; start one afterwards if you want scoring.",
  },
] as const;

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
