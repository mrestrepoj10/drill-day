"use client";

import { ShieldAlert } from "lucide-react";
import type { RegisteredTool } from "@layer0/webmcp";
import type { TrainingStep } from "@layer0/viewer-training";
import { GUARDED_TOOLS } from "@/lib/training/tools";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The stage's allow list, in the space of one navbar badge.
 *
 * The guardrail used to be visible only after the agent tripped it — a refusal
 * in the log, after the fact. This states the same rule before anything is
 * called, and it moves as the step moves. It lives in the navbar because that
 * is the one surface present at every width and in every pane state, and
 * because the mission panel belongs to the objective. The tool names are
 * detail, and detail belongs one click away.
 *
 * A tool only counts as withheld if it actually routes through the runtime
 * guard. `GUARDED_TOOLS` is that set, so nothing here claims a refusal the page
 * would not make.
 */
export function ToolAccessBadge({
  tools,
  step,
}: {
  tools: RegisteredTool[];
  step: TrainingStep | undefined;
}) {
  const allowList = step?.allowedTools;
  if (!tools.length || !allowList) return null;

  const blocked = tools.filter(
    (tool) => !allowList.includes(tool.name) && tool.name in GUARDED_TOOLS,
  );
  if (!blocked.length) return null;

  const liveCount = tools.length - blocked.length;

  return (
    <Popover>
      <PopoverTrigger
        className="workspace-guardrail-action"
        aria-label={`${blocked.length} of ${tools.length} agent tools withheld on this stage`}
      >
        <ShieldAlert aria-hidden="true" />
        <span className="workspace-trigger-label">{blocked.length} withheld</span>
        <span className="workspace-guardrail-count" aria-hidden="true">
          {blocked.length}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(340px,calc(100vw-1.5rem))] p-0"
      >
        <div className="border-b border-border px-3 py-2.5">
          <h3 className="text-[12px] font-semibold leading-[1.4]">Withheld on this stage</h3>
          <p className="mt-0.5 text-[11px] leading-[1.4] text-text-tertiary">
            The page refuses these calls and logs the refusal.
          </p>
        </div>
        <ul className="max-h-[min(340px,60dvh)] overflow-y-auto scrollbar-thin">
          {blocked.map((tool) => (
            <li key={tool.name} className="border-b border-border/60 px-3 py-2 last:border-b-0">
              <span className="block font-mono text-[11px] leading-[1.4] text-warning">
                {tool.name}
              </span>
              <span className="mt-0.5 block text-pretty text-[11px] leading-[1.45] text-muted-foreground">
                {GUARDED_TOOLS[tool.name]}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-3 py-2 text-[11px] leading-[1.4] text-text-tertiary">
          The other {liveCount} stay live, including reading the session and
          inspecting any component by name.
        </p>
      </PopoverContent>
    </Popover>
  );
}
