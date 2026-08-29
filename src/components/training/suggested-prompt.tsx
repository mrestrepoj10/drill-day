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

export function SuggestedPrompt() {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(SUGGESTED_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <p className="text-pretty text-[13px] leading-[1.5] text-foreground">{SUGGESTED_PROMPT}</p>
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
