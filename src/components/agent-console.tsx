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
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useModelContext, type RegisteredTool, type ToolCall } from "@layer0/webmcp";
import type { Decision, TrainingSession } from "@layer0/viewer-training";
import { ELEMENT_BY_ID, ROOMS } from "@/lib/training/facility";

export interface Drill {
  label: string;
  hint: string;
  steps: { tool: string; input?: Record<string, unknown>; pause?: number }[];
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
}: {
  drills?: Drill[];
  namespace: string;
  session: TrainingSession;
}) {
  const { flavor, tools, calls, run, clear } = useModelContext();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"activity" | "tools">("activity");
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
    <aside className="workspace-activity glass-panel flex h-full min-h-0 flex-col border-l border-border">
      <header className="border-b border-border px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${flavor === "native" ? "bg-success" : "bg-amber"}`} />
          <div>
            <div className="text-[12px] font-semibold">Agent activity</div>
            <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              {flavor === "native" ? "Native WebMCP" : "WebMCP polyfill"} · {mine.length} tools discoverable
            </div>
          </div>
          <span className="ml-auto rounded-full border border-cyan/25 bg-cyan/8 px-2 py-1 font-mono text-[9px] text-cyan">
            live
          </span>
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
          Human choices, scene events, and every agent tool call share one audit trail.
        </p>
      </header>

      <div role="tablist" aria-label="Agent console" className="flex border-b border-border p-1.5 text-[11px]">
        {(["activity", "tools"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => setTab(item)}
            className={`flex-1 rounded-md px-3 py-2 capitalize transition ${
              tab === item ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item === "activity" ? "Activity" : `Site tools · ${mine.length}`}
            {item === "activity" && events.length ? <span className="ml-1 text-muted-foreground">{events.length}</span> : null}
          </button>
        ))}
      </div>

      {tab === "tools" ? (
        <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {mine.map((tool) => (
            <ToolRow
              key={tool.name}
              tool={tool}
              open={open === tool.name}
              onToggle={() => setOpen(open === tool.name ? null : tool.name)}
              onRun={(input) => run(tool.name, input)}
            />
          ))}
        </div>
      ) : (
        <ActivityFeed
          events={events}
          drills={drills}
          busy={busy}
          onRunDrill={runDrill}
          onClearToolHistory={clear}
        />
      )}
    </aside>
  );
}

function ActivityFeed({
  events,
  drills,
  busy,
  onRunDrill,
  onClearToolHistory,
}: {
  events: TimelineEvent[];
  drills: Drill[];
  busy: string | null;
  onRunDrill: (drill: Drill) => Promise<void>;
  onClearToolHistory: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(SUGGESTED_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-cyan" aria-hidden="true" />
          <span className="eyebrow text-muted-foreground">Try with ChatGPT</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-foreground">{SUGGESTED_PROMPT}</p>
        <button
          type="button"
          onClick={copyPrompt}
          className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-cyan transition hover:text-primary"
        >
          {copied ? <ClipboardCheck className="size-3" /> : <Clipboard className="size-3" />}
          {copied ? "Copied" : "Copy prompt"}
        </button>
      </div>

      {events.length ? (
        <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {events.map((event) => <TimelineRow key={event.id} event={event} />)}
          <div ref={endRef} />
        </div>
      ) : (
        <div className="grid min-h-36 flex-1 place-items-center px-6 text-center">
          <div>
            <Activity className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Start the flagship drill or ask ChatGPT to inspect this page. Activity appears here as it happens.
            </p>
          </div>
        </div>
      )}

      {drills.length ? (
        <details className="border-t border-border px-4 py-3">
          <summary className="cursor-pointer select-none text-[11px] font-semibold text-muted-foreground hover:text-foreground">
            Demo rehearsals
          </summary>
          <div className="mt-2 space-y-1.5">
            {drills.map((drill) => (
              <button
                key={drill.label}
                type="button"
                disabled={!!busy}
                onClick={() => onRunDrill(drill)}
                className="w-full rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-left transition hover:bg-accent disabled:opacity-40"
              >
                <span className="block text-[11px] font-medium">{busy === drill.label ? "Running…" : drill.label}</span>
                <span className="mt-0.5 block text-[9px] leading-relaxed text-muted-foreground">{drill.hint}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={onClearToolHistory}
              className="pt-1 text-[9px] text-muted-foreground hover:text-foreground"
            >
              Clear tool-call history
            </button>
          </div>
        </details>
      ) : null}
    </div>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
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
    <article className={`border-b border-border/65 px-4 py-3 ${event.tone === "bad" ? "bg-destructive/5" : ""}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border ${toneClass(event.tone)}`}>
          <Icon className="size-3" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{event.actor}</span>
            <time className="ml-auto font-mono text-[9px] text-muted-foreground">{formatTime(event.at)}</time>
          </div>
          <p className="mt-1 text-[11px] font-semibold leading-relaxed">{event.title}</p>
          {event.detail ? <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{event.detail}</p> : null}
          {event.call ? (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[9px] text-muted-foreground hover:text-foreground">Technical details</summary>
              <pre className="mt-1 max-h-28 overflow-auto rounded-md bg-muted/50 p-2 text-[9px] leading-relaxed text-muted-foreground">
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
        className="flex w-full items-start gap-2 px-4 py-3 text-left transition hover:bg-accent/50"
      >
        {open ? <ChevronDown className="mt-0.5 size-3.5 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-3.5 text-muted-foreground" />}
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold">{tool.title ?? tool.name}</span>
          <span className="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground">{tool.name}</span>
        </span>
        {tool.annotations?.readOnlyHint ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-muted-foreground">read</span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-2.5 px-4 pb-4">
          <p className="text-[10px] leading-relaxed text-muted-foreground">{tool.description}</p>
          {Object.entries(props).map(([key, spec]) => (
            <label key={key} className="block">
              <span className="font-mono text-[9px] text-muted-foreground">{key}</span>
              {spec.enum ? (
                <select
                  value={values[key] ?? ""}
                  onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-[11px]"
                >
                  <option value="">—</option>
                  {spec.enum.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  value={values[key] ?? ""}
                  onChange={(event) => setValues({ ...values, [key]: event.target.value })}
                  placeholder={spec.description ?? spec.type ?? "string"}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-[11px]"
                />
              )}
            </label>
          ))}
          {error ? <p className="text-[10px] text-destructive">{error}</p> : null}
          <button
            type="button"
            onClick={submit}
            className="h-9 w-full rounded-md bg-foreground px-2 text-[11px] font-semibold text-background transition hover:opacity-90"
          >
            Execute site tool
          </button>
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
  if (tone === "near") return "border-amber/35 bg-amber/10 text-amber";
  if (tone === "bad") return "border-destructive/35 bg-destructive/10 text-destructive";
  if (tone === "agent") return "border-cyan/35 bg-cyan/10 text-cyan";
  return "border-border bg-muted/40 text-muted-foreground";
}

function formatTime(at: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(at);
}
