"use client";

import { ShieldAlert, Wrench } from "lucide-react";
import type { RegisteredTool } from "@layer0/webmcp";
import type { TrainingStep } from "@layer0/viewer-training";
import { GUARDED_TOOLS } from "@/lib/training/tools";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * What the agent can reach right now, in the space of one navbar badge.
 *
 * The guardrail used to be visible only after the agent tripped it — a refusal
 * in the log, after the fact. This states the same rule before anything is
 * called, and it moves as the step moves. It lives in the navbar because that
 * is the one surface present at every width and in every pane state, and it
 * stays visible with nothing withheld because "Agent tools" is also how a
 * first-time visitor finds out this page has any.
 *
 * A tool only counts as withheld if it actually routes through the runtime
 * guard. `GUARDED_TOOLS` is that set, so nothing here claims a refusal the page
 * would not make.
 */
export function AgentToolsBadge({
  tools,
  step,
}: {
  tools: RegisteredTool[];
  step: TrainingStep | undefined;
}) {
  if (!tools.length) return null;

  const allowList = step?.allowedTools;
  const withheld = allowList
    ? tools.filter((tool) => !allowList.includes(tool.name) && tool.name in GUARDED_TOOLS)
    : [];
  const live = tools.filter((tool) => !withheld.includes(tool));

  return (
    <Popover>
      <PopoverTrigger
        className="workspace-tools-action"
        data-withheld={withheld.length > 0}
        aria-label={
          withheld.length
            ? `Agent tools, ${withheld.length} of ${tools.length} withheld on this stage`
            : `Agent tools, all ${tools.length} available`
        }
      >
        {withheld.length ? (
          <ShieldAlert aria-hidden="true" />
        ) : (
          <Wrench aria-hidden="true" />
        )}
        <span className="workspace-trigger-label">Agent tools</span>
        <span className="workspace-tools-count" aria-hidden="true">
          {withheld.length ? withheld.length : tools.length}
        </span>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(360px,calc(100vw-1.5rem))] p-0"
      >
        <div className="border-b border-border px-3 py-2.5">
          <h3 className="text-[12px] font-semibold leading-[1.4]">
            {tools.length} site tools on this page
          </h3>
          <p className="mt-0.5 text-pretty text-[11px] leading-[1.45] text-text-tertiary">
            {withheld.length
              ? "An agent can call the live ones. The page refuses the rest and logs the refusal."
              : "An agent in a WebMCP browser can call any of these against what you are looking at."}
          </p>
        </div>

        <ul className="max-h-[min(320px,55dvh)] overflow-y-auto scrollbar-thin">
          {withheld.map((tool) => (
            <li
              key={tool.name}
              className="border-b border-border/60 bg-warning/6 px-3 py-2 last:border-b-0"
            >
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-[1.4] text-warning">
                  {tool.name}
                </span>
                <span className="shrink-0 text-[10px] font-medium leading-[1.4] text-warning">
                  withheld
                </span>
              </span>
              <span className="mt-0.5 block text-pretty text-[11px] leading-[1.45] text-muted-foreground">
                {GUARDED_TOOLS[tool.name]}
              </span>
            </li>
          ))}
          {live.map((tool) => (
            <li
              key={tool.name}
              className="flex items-baseline gap-2 border-b border-border/60 px-3 py-1.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-[1.4] text-muted-foreground">
                {tool.name}
              </span>
              {tool.annotations?.readOnlyHint ? (
                <span className="shrink-0 text-[10px] leading-[1.4] text-text-tertiary">read</span>
              ) : null}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
