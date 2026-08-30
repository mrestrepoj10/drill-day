"use client";

import { useState } from "react";
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
  "Walk the chilled-water system in this building and brief me the way you would at a shift handover. " +
  "Pin a note on anything I should know before I touch a valve.";

export function SuggestedPrompt({ prompt = SUGGESTED_PROMPT }: { prompt?: string }) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <p className="text-pretty text-[13px] leading-[1.5] text-foreground">{prompt}</p>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={copyPrompt}
        className="mt-2 -ml-2 text-interactive hover:text-foreground"
      >
        {copied ? <ClipboardCheck className="size-3" /> : <Clipboard className="size-3" />}
        {copied ? "Copied" : "Copy prompt"}
      </Button>
    </>
  );
}
