"use client";

import { ChevronDown, Lock, ShieldAlert } from "lucide-react";
import type { RegisteredTool } from "@layer0/webmcp";
import type { TrainingSession } from "@layer0/viewer-training";
import { GUARDED_TOOLS } from "@/lib/training/tools";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Which site tools this step leaves switched on.
 *
 * The guardrail used to be visible only after the agent tripped it — a refusal
 * in the log, after the fact. This is the same rule stated before anything
 * happens, and it moves as the step moves: the learner watches the toolset
 * narrow for the wayfinding stage and widen again once they are in the room.
 *
 * A tool is only listed as blockable if it actually routes through the runtime
 * guard; `GUARDED_TOOLS` is that set, so nothing here claims a refusal the page
 * would not make.
 */
export function ToolAccess({
  tools,
  session,
}: {
  tools: RegisteredTool[];
  session: TrainingSession;
}) {
  if (!tools.length) return null;

  const allowList = session.status === "running" ? session.step?.allowedTools : undefined;
  const rows = tools.map((tool) => ({
    name: tool.name,
    blocked: allowList ? !allowList.includes(tool.name) && tool.name in GUARDED_TOOLS : false,
    because: GUARDED_TOOLS[tool.name],
  }));
  // The withheld half is the part worth reading, and the only part that gets
  // its reason spelled out.
  const blocked = rows.filter((row) => row.blocked);
  const live = rows.filter((row) => !row.blocked);
  const blockedCount = blocked.length;

  return (
    <Collapsible defaultOpen className="border-b border-border/70">
      <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
        <span>
          <span className="block text-[12px] font-semibold leading-[1.4]">Tool access</span>
          <span className="mt-0.5 block text-[11px] leading-[1.4] text-text-tertiary">
            {blockedCount
              ? `${live.length} live · ${blockedCount} withheld for this stage`
              : `All ${rows.length} site tools live`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {blockedCount ? (
            <span className="inline-flex items-center gap-1 rounded-md border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium leading-[1.4] text-warning">
              <ShieldAlert className="size-3" aria-hidden="true" />
              {blockedCount}
            </span>
          ) : null}
          <ChevronDown
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
            aria-hidden="true"
          />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-4 pb-3">
        {blocked.length ? (
          <ul className="grid gap-px overflow-hidden rounded-lg border border-warning/25 bg-warning/15">
            {blocked.map((row) => (
              <li key={row.name} className="flex items-start gap-2 bg-warning/6 px-2.5 py-2">
                <Lock className="mt-0.5 size-3 shrink-0 text-warning" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] leading-[1.4] text-warning">
                    {row.name}
                  </span>
                  <span className="mt-0.5 block text-pretty text-[11px] leading-[1.45] text-muted-foreground">
                    {row.because}
                  </span>
                </span>
                <span className="sr-only">blocked on this stage</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* The live half is a roll call, not a reading list — it only has to
            show that the rest of the toolset is still there. */}
        <p className={cn("text-[11px] leading-[1.6] text-text-tertiary", blocked.length && "mt-2.5")}>
          <span className="font-medium text-muted-foreground">
            {live.length} live:{" "}
          </span>
          <span className="font-mono">{live.map((row) => row.name).join(", ")}</span>
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
