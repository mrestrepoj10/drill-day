"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clipboard,
  ClipboardCheck,
  Footprints,
  Presentation,
  ShieldAlert,
  Wrench,
  X,
} from "lucide-react";
import type { ModelContextFlavor, RegisteredTool, ToolCall } from "@layer0/webmcp";
import type { Decision, TrainingSession } from "@layer0/viewer-training";
import { ELEMENT_BY_ID, ROOMS } from "@/lib/training/facility";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface Drill {
  label: string;
  hint: string;
  steps: { tool: string; input?: Record<string, unknown>; pause?: number }[];
}

export interface AgentConsoleContext {
  flavor: ModelContextFlavor;
  tools: RegisteredTool[];
  calls: readonly ToolCall[];
  run: (name: string, input?: object) => Promise<string>;
  clear: () => void;
}

type TimelineEvent = {
  id: string;
  at: number;
  actor: string;
  title: string;
  detail?: string;
  tone: "neutral" | "good" | "near" | "bad" | "agent";
  call?: ToolCall;
};

const SUGGESTED_PROMPT =
  "Read the current Drill Day session. Coach me through the objective without locating or revealing the answer.";

export function AgentConsole({
  drills = [],
  namespace,
  session,
  context,
  compactOpen,
  onClose,
}: {
  drills?: Drill[];
  namespace: string;
  session: TrainingSession;
  context: AgentConsoleContext;
  compactOpen: boolean;
  onClose: () => void;
}) {
  const { flavor, tools, calls, run, clear } = context;
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"activity" | "tools">("activity");
  const [narrate, setNarrate] = useState(false);
  const mine = useMemo(
    () => tools.filter((tool) => tool.name.startsWith(namespace)),
    [tools, namespace],
  );
  const titles = useMemo(
    () => new Map(mine.map((tool) => [tool.name, tool.title ?? tool.name])),
    [mine],
  );
  const events = useMemo(
    () => buildTimeline(calls, session, titles),
    [calls, session, titles],
  );

  const runDrill = async (drill: Drill) => {
    setBusy(drill.label);
    setTab("activity");
    try {
      for (const step of drill.steps) {
        try {
          await run(step.tool, step.input ?? {});
        } catch {
          // A refusal is a designed guardrail and remains visible in the log.
        }
        await new Promise((resolve) => setTimeout(resolve, step.pause ?? 650));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside
      id="agent-console"
      data-compact-open={compactOpen}
      className="workspace-activity glass-panel flex h-full min-h-0 flex-col"
    >
      <header className="flex items-start gap-2 border-b border-border py-3 pl-4 pr-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={-1}
              className={`mt-1.5 size-2 rounded-full ${flavor === "native" ? "bg-success" : "bg-warning"}`}
            />
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6} className="max-w-52 text-pretty">
            Human choices, scene events, and every agent tool call share one audit trail.
          </TooltipContent>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold leading-[1.4]">Agent activity</div>
          <div className="mt-0.5 text-[12px] leading-[1.4] text-muted-foreground">
            {flavor === "native"
              ? `Native WebMCP · ${mine.length} tools discovered`
              : `Native WebMCP not detected · in-page console, ${mine.length} tools`}
          </div>
        </div>
        <span className="mt-0.5 text-[12px] font-medium text-success">Live</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={narrate ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Narrate for camera"
              aria-pressed={narrate}
              onClick={() => setNarrate((on) => !on)}
            >
              <Presentation className="size-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Narrate for camera — larger log text, each new event highlighted as it lands
          </TooltipContent>
        </Tooltip>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close agent activity"
          onClick={onClose}
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </header>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value === "tools" ? "tools" : "activity")}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b border-border p-1.5">
          <TabsList className="w-full">
            <TabsTrigger value="activity" className="text-[12px]">
              Activity{events.length ? <span className="text-muted-foreground">{events.length}</span> : null}
            </TabsTrigger>
            <TabsTrigger value="tools" className="text-[12px]">
              Site tools · {mine.length}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tools" className="min-h-0 overflow-y-auto scrollbar-thin">
          {mine.map((tool) => (
            <ToolRow
              key={tool.name}
              tool={tool}
              open={open === tool.name}
              onToggle={() => setOpen(open === tool.name ? null : tool.name)}
              onRun={(input) => run(tool.name, input)}
            />
          ))}
        </TabsContent>

        <TabsContent value="activity" className="flex min-h-0 flex-col">
          <ActivityFeed
            events={events}
            drills={drills}
            busy={busy}
            narrate={narrate}
            onRunDrill={runDrill}
            onClearToolHistory={clear}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function SuggestedPrompt() {
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

function ActivityFeed({
  events,
  drills,
  busy,
  narrate,
  onRunDrill,
  onClearToolHistory,
}: {
  events: TimelineEvent[];
  drills: Drill[];
  busy: string | null;
  narrate: boolean;
  onRunDrill: (drill: Drill) => Promise<void>;
  onClearToolHistory: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  // In narrate mode the newest event holds a highlight for ~2 s, long enough
  // for a viewer watching a recording to catch each tool call as it lands.
  // The animation runs once and self-clears, so no timer state is needed.
  const lastId = events.length ? events[events.length - 1].id : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {events.length ? (
        <>
          <Collapsible className="border-b border-border">
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-2.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
              Try with ChatGPT
              <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-3">
              <SuggestedPrompt />
            </CollapsibleContent>
          </Collapsible>
          <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {events.map((event) => (
              <TimelineRow
                key={event.id}
                event={event}
                narrate={narrate}
                flash={narrate && event.id === lastId}
              />
            ))}
            <div ref={endRef} />
          </div>
        </>
      ) : (
        <div className="grid min-h-36 flex-1 place-items-center px-5 text-center">
          <div className="max-w-64">
            <Activity className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
              Start the flagship drill or ask ChatGPT to inspect this page. Activity appears here as it happens.
            </p>
            <div className="mt-4 rounded-md border border-border p-3 text-left">
              <h2 className="text-[12px] font-semibold leading-[1.4]">Try with ChatGPT</h2>
              <div className="mt-1.5">
                <SuggestedPrompt />
              </div>
            </div>
          </div>
        </div>
      )}

      {drills.length ? (
        <Collapsible className="border-t border-border">
          <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground">
            Demo rehearsals
            <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 px-4 pb-3">
            {drills.map((drill) => (
              <Button
                key={drill.label}
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={() => onRunDrill(drill)}
                className="h-auto w-full flex-col items-start gap-0.5 px-2.5 py-2 text-left font-normal"
              >
                <span className="text-[13px] font-medium leading-[1.4]">
                  {busy === drill.label ? "Running…" : drill.label}
                </span>
                <span className="whitespace-normal text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                  {drill.hint}
                </span>
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onClearToolHistory}
              className="-ml-2 text-muted-foreground hover:text-foreground"
            >
              Clear tool-call history
            </Button>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function TimelineRow({
  event,
  narrate = false,
  flash = false,
}: {
  event: TimelineEvent;
  narrate?: boolean;
  flash?: boolean;
}) {
  const Icon = event.tone === "good"
    ? CheckCircle2
    : event.tone === "bad"
      ? ShieldAlert
      : event.actor === "Learner"
        ? Footprints
        : event.actor === "ChatGPT"
          ? Bot
          : event.call
            ? Wrench
            : CircleDot;

  return (
    <article
      className={`surface-pop border-b border-border/65 px-4 py-3 ${event.tone === "bad" ? "bg-destructive/5" : ""} ${flash ? "narrate-flash" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border ${toneClass(event.tone)}`}>
          <Icon className="size-3" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`${narrate ? "text-[13px]" : "text-[12px]"} font-medium text-muted-foreground`}>{event.actor}</span>
            <time className="ml-auto font-mono text-[11px] tabular-nums text-text-tertiary">{formatTime(event.at)}</time>
          </div>
          <p className={`mt-1 text-pretty ${narrate ? "text-[15px]" : "text-[13px]"} font-semibold leading-[1.4]`}>{event.title}</p>
          {event.detail ? (
            <p className={`mt-1 text-pretty ${narrate ? "text-[13px]" : "text-[12px]"} leading-[1.5] text-muted-foreground`}>
              {event.detail}
            </p>
          ) : null}
          {event.call ? (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[11px] text-text-tertiary transition-colors hover:text-foreground">Technical details</summary>
              <pre className="mt-1 max-h-28 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-[1.4] text-muted-foreground">
                {JSON.stringify({ input: event.call.input, result: event.call.result }, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ToolRow({
  tool,
  open,
  onToggle,
  onRun,
}: {
  tool: RegisteredTool;
  open: boolean;
  onToggle: () => void;
  onRun: (input: Record<string, unknown>) => Promise<string>;
}) {
  const props = (tool.inputSchema?.properties ?? {}) as Record<string, { type?: string; enum?: string[]; description?: string }>;
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();

  const submit = async () => {
    setError(undefined);
    const input: Record<string, unknown> = {};
    for (const [key, spec] of Object.entries(props)) {
      const raw = values[key];
      if (raw === undefined || raw === "") continue;
      if (spec.type === "number") input[key] = Number(raw);
      else if (spec.type === "boolean") input[key] = raw === "true";
      else if (spec.type === "array") input[key] = raw.split(/[,\s]+/).filter(Boolean);
      else input[key] = raw;
    }
    try {
      await onRun(input);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="border-b border-border/60">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {open ? <ChevronDown className="mt-0.5 size-3.5 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-3.5 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-[1.4]">{tool.title ?? tool.name}</span>
          <span className="mt-0.5 block truncate font-mono text-[11px] leading-[1.4] text-text-tertiary">{tool.name}</span>
        </span>
        {tool.annotations?.readOnlyHint ? (
          <span className="text-[12px] text-muted-foreground">Read only</span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-2.5 px-4 pb-4">
          <p className="text-pretty text-[12px] leading-[1.5] text-muted-foreground">{tool.description}</p>
          {Object.entries(props).map(([key, spec]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`tool-${tool.name}-${key}`} className="font-mono text-[11px] font-normal leading-[1.4] text-text-tertiary">
                {key}
              </Label>
              {spec.enum ? (
                <Select
                  value={values[key] ?? ""}
                  onValueChange={(value) => setValues({ ...values, [key]: value })}
                >
                  <SelectTrigger id={`tool-${tool.name}-${key}`} className="w-full text-[13px]">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {spec.enum.map((option) => (
                      <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`tool-${tool.name}-${key}`}
                  value={values[key] ?? ""}
                  onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                  placeholder={spec.description ?? spec.type ?? "string"}
                  className="text-[13px]"
                />
              )}
            </div>
          ))}
          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
          <Button type="button" onClick={submit} className="w-full text-[13px] font-semibold">
            Execute site tool
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function buildTimeline(calls: readonly ToolCall[], session: TrainingSession, titles: Map<string, string>): TimelineEvent[] {
  const callEvents: TimelineEvent[] = calls.map((call) => ({
    id: `call-${call.id}`,
    at: call.startedAt,
    actor: call.origin === "agent" ? "ChatGPT" : "Demo",
    title: call.error ? `${titles.get(call.name) ?? call.name} was refused` : titles.get(call.name) ?? call.name,
    detail: call.error
      ? call.error
      : `${call.readOnly ? "Read" : "Action"} completed${call.durationMs === undefined ? "" : ` in ${call.durationMs} ms`}.`,
    tone: call.error ? "bad" : call.origin === "agent" ? "agent" : "neutral",
    call,
  }));
  const decisionEvents = session.decisions.map(decisionEvent);
  const coachingEvents: TimelineEvent[] = session.coaching.map((line, index) => ({
    id: `coach-${line.at}-${index}`,
    at: line.at,
    actor: line.from === "agent" ? "ChatGPT" : "Coach",
    title: line.text,
    tone: line.from === "agent" ? "agent" : "neutral",
  }));
  return [...callEvents, ...decisionEvents, ...coachingEvents].sort((a, b) => a.at - b.at).slice(-120);
}

function decisionEvent(decision: Decision, index: number): TimelineEvent {
  const element = decision.element ? ELEMENT_BY_ID.get(decision.element) : undefined;
  const room = decision.room ? ROOMS.find((item) => item.id === decision.room) : undefined;
  if (decision.kind === "enter") {
    return {
      id: `decision-${decision.at}-${index}`,
      at: decision.at,
      actor: "Scene",
      title: `Entered ${room?.name ?? decision.room ?? "a new space"}`,
      detail: decision.position ? `Position ${decision.position.map((value) => value.toFixed(1)).join(", ")} m` : undefined,
      tone: "neutral",
    };
  }
  if (decision.kind === "hint") {
    return { id: `decision-${decision.at}-${index}`, at: decision.at, actor: "Learner", title: "Requested a hint", tone: "near" };
  }
  const verdict = decision.verdict;
  return {
    id: `decision-${decision.at}-${index}`,
    at: decision.at,
    actor: decision.kind === "blocked" ? "Guardrail" : "Learner",
    title: element
      ? `Selected ${element.name}`
      : decision.kind === "arrive"
        ? `Reached ${room?.name ?? "the destination"}`
        : verdict?.message ?? "Navigation event",
    detail: verdict?.diagnosis ?? verdict?.message,
    tone: verdict?.kind === "correct" ? "good" : verdict?.kind === "near" ? "near" : verdict ? "bad" : "neutral",
  };
}

function toneClass(tone: TimelineEvent["tone"]): string {
  if (tone === "good") return "border-success/35 bg-success/10 text-success";
  if (tone === "near") return "border-warning/35 bg-warning/10 text-warning";
  if (tone === "bad") return "border-destructive/35 bg-destructive/10 text-destructive";
  return "border-border bg-muted/40 text-muted-foreground";
}

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatTime(at: number): string {
  return TIME_FORMAT.format(at);
}
