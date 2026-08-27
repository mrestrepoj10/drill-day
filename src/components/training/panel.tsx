"use client";

import Image from "next/image";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Eye,
  Lightbulb,
  MapPinned,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Timer,
} from "lucide-react";
import type { TrainingSession } from "@layer0/viewer-training";
import { ROOMS } from "@/lib/training/facility";
import { ROLES } from "@/lib/training/missions";
import { FloorPlan } from "@/components/training/plan";

const FLAGSHIP_STAGES = [
  { label: "Navigate", detail: "Find Room 214" },
  { label: "Diagnose", detail: "Identify the leak" },
  { label: "Isolate", detail: "Choose the right valve" },
];

export function TrainingPanel({
  session,
  onPickRole,
  onHint,
  onSection,
  sectionOn,
  onReplay,
  replaying,
}: {
  session: TrainingSession;
  onPickRole: (role: string) => void;
  onHint: () => void;
  onSection: () => void;
  sectionOn: boolean;
  onReplay: () => void;
  replaying: boolean;
}) {
  const step = session.step;
  const mission = session.mission;
  const lastVerdict = [...session.decisions]
    .reverse()
    .find((decision) => decision.verdict && decision.kind !== "hint");
  const highlighted = session.revealed.flatMap((hint) => hint.reveals ?? []);
  const stages =
    mission?.id === "m-technician"
      ? FLAGSHIP_STAGES
      : mission?.steps.map((item) => ({
          label: item.mode === "reach" ? "Navigate" : "Select",
          detail: item.prompt,
        })) ?? [];

  return (
    <aside className="workspace-mission glass-panel scrollbar-thin flex h-full min-h-0 flex-col overflow-y-auto border-r border-border">
      {!mission ? (
        <MissionLaunch onPickRole={onPickRole} />
      ) : (
        <>
          <header className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="eyebrow text-cyan">Live incident · 07:42</div>
                <h1 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                  {mission.title}
                </h1>
              </div>
              <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan">
                {mission.author}
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Northgate Data &amp; Logistics · Level {session.level}
            </p>
          </header>

          <section className="border-b border-border px-5 py-4" aria-label="Mission progress">
            <ol className="space-y-3">
              {stages.map((stage, index) => {
                const cleared = session.progress[index]?.cleared;
                const current = index === session.stepIndex && session.status === "running";
                return (
                  <li key={`${stage.label}-${index}`} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold ${
                        cleared
                          ? "border-success/40 bg-success/15 text-success"
                          : current
                            ? "border-cyan bg-cyan text-primary-foreground"
                            : "border-border bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {cleared ? "✓" : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[13px] font-semibold ${current ? "text-foreground" : "text-muted-foreground"}`}>
                        {stage.label}
                        {current ? <span className="sr-only">, current step</span> : null}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {stage.detail}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="border-b border-border px-5 py-5">
            {step ? (
              <>
                <div className="eyebrow text-muted-foreground">
                  Step {session.stepIndex + 1} · {step.mode === "reach" ? "Navigate" : "Select component"}
                </div>
                <p className="mt-3 text-[16px] font-medium leading-[1.5] tracking-[-0.01em]">
                  {clearerPrompt(mission.id, session.stepIndex, step.prompt)}
                </p>
                {step.allowedTools ? (
                  <div className="mt-4 flex gap-2.5 rounded-xl border border-amber/30 bg-amber/8 p-3 text-amber">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p className="text-[12px] leading-relaxed">
                      <b>Search is disabled.</b> The learner and agent must reason from the building, hints, and system context.
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                <div className="eyebrow text-success">Mission complete</div>
                <p className="mt-3 text-[15px] leading-relaxed">{summarise(session)}</p>
              </div>
            )}
          </section>

          {lastVerdict?.verdict ? (
            <section
              aria-live="polite"
              className={`border-b border-border px-5 py-4 ${
                lastVerdict.verdict.kind === "correct"
                  ? "bg-success/6"
                  : lastVerdict.verdict.kind === "near"
                    ? "bg-amber/6"
                    : "bg-destructive/6"
              }`}
            >
              <div className="eyebrow text-muted-foreground">Latest feedback</div>
              <p className="mt-2 text-[13px] font-semibold leading-relaxed">
                {lastVerdict.verdict.message}
              </p>
              {lastVerdict.verdict.diagnosis ? (
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                  {lastVerdict.verdict.diagnosis}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="border-b border-border p-4">
            <div className="grid grid-cols-3 gap-2">
              <MissionControl
                icon={Lightbulb}
                label={
                  step && session.hintsUsed < step.hints.length
                    ? `Hint · ${step.hints.length - session.hintsUsed}`
                    : "No hints"
                }
                onClick={onHint}
                disabled={!step || session.hintsUsed >= (step?.hints.length ?? 0)}
              />
              <MissionControl
                icon={Eye}
                label={sectionOn ? "Restore ceiling" : "Open ceiling"}
                onClick={onSection}
                active={sectionOn}
              />
              <MissionControl
                icon={RotateCcw}
                label={replaying ? "Replaying" : "Replay decisions"}
                onClick={onReplay}
                disabled={replaying || !session.decisions.some((item) => item.verdict)}
              />
            </div>
          </section>

          <section className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="eyebrow text-muted-foreground">Live floor plan</div>
                <p className="mt-1.5 text-[12px] text-foreground">
                  {session.room
                    ? ROOMS.find((room) => room.id === session.room)?.name
                    : "Outside the building"}
                </p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
                <MapPinned className="size-3" aria-hidden="true" /> level {session.level}
              </span>
            </div>
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-[#0a0f12] p-2">
              <FloorPlan
                level={session.level}
                position={session.position}
                room={session.room}
                highlighted={highlighted}
                trail={session.trail}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Position and route are live. Reach objectives must be walked in the 3D scene.
            </p>
          </section>

          {session.coaching.length ? (
            <section className="border-b border-border px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <Bot className="size-4 text-cyan" aria-hidden="true" />
                <div className="eyebrow text-muted-foreground">Coach</div>
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {session.coaching.at(-1)?.text}
              </p>
            </section>
          ) : null}

          <div className="mt-auto p-4">
            <button
              type="button"
              onClick={() => onPickRole("")}
              className="h-10 w-full rounded-lg border border-border text-[12px] font-medium text-muted-foreground transition hover:border-[#43515a] hover:bg-accent hover:text-foreground"
            >
              Change training scenario
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function MissionLaunch({ onPickRole }: { onPickRole: (role: string) => void }) {
  const otherRoles = ROLES.filter((role) => role.id !== "technician");

  return (
    <div className="flex min-h-full flex-col">
      <div className="relative aspect-[1.48/1] overflow-hidden border-b border-border">
        <Image
          src="/media/northgate-leak-briefing.png"
          alt="Northgate maintenance corridor with an open ceiling void and chilled-water equipment"
          fill
          priority
          sizes="(max-width: 820px) 100vw, 350px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d1215] via-[#0d1215]/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/80 backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-amber" /> Live callout · 07:42
          </span>
        </div>
      </div>

      <section className="px-5 py-5">
        <div className="eyebrow text-cyan">Northgate Data &amp; Logistics</div>
        <h1 className="mt-3 text-[26px] font-semibold leading-[1.08] tracking-[-0.045em]">
          Train inside the building—not from a manual.
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          Walk to Room 214, diagnose a chilled-water leak, and isolate the right valve. Your agent shares the live scene, coaches the learner, and can author the next drill.
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2" aria-label="Drill stages">
          {FLAGSHIP_STAGES.map((stage, index) => (
            <div key={stage.label} className="rounded-lg border border-border bg-muted/20 p-2.5">
              <span className="font-mono text-[10px] text-cyan">0{index + 1}</span>
              <span className="mt-1 block text-[11px] font-semibold">{stage.label}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onPickRole("technician")}
          className="group mt-5 flex h-12 w-full items-center justify-between rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition hover:brightness-105"
        >
          <span className="flex items-center gap-2">
            <Timer className="size-4" aria-hidden="true" /> Start the 90-second drill
          </span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </button>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-cyan/20 bg-cyan/6 p-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-cyan" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <b className="text-foreground">WebMCP changes the lesson.</b> The agent can inspect the live model and guide without bypassing the exercise rules.
          </p>
        </div>
      </section>

      <details className="group border-t border-border px-5 py-4">
        <summary className="flex list-none items-center justify-between text-[12px] font-semibold text-muted-foreground transition hover:text-foreground">
          Explore six more roles
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-3 space-y-2">
          {otherRoles.map((role) => (
            <button
              type="button"
              key={role.id}
              onClick={() => onPickRole(role.id)}
              className="w-full rounded-lg border border-border bg-muted/10 p-3 text-left transition hover:border-[#43515a] hover:bg-accent"
            >
              <span className="block text-[12px] font-semibold">{role.label}</span>
              <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                {role.blurb}
              </span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

function MissionControl({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: typeof Lightbulb;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex min-h-16 flex-col items-start justify-between rounded-lg border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "border-cyan/50 bg-cyan/10 text-cyan"
          : "border-border bg-muted/15 text-muted-foreground hover:border-[#43515a] hover:bg-accent hover:text-foreground"
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="mt-2 text-[10px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

function clearerPrompt(missionId: string, stepIndex: number, fallback: string): string {
  if (missionId !== "m-technician") return fallback;
  return [
    "Find Room 214 on Level 1. Follow the corridor west and read the building signs.",
    "Look above the missing ceiling tile. Hover to identify components, then select the source of the leak.",
    "Trace the pipe upstream. Select the nearest chilled-water valve that stops this leak without shutting down the whole building.",
  ][stepIndex] ?? fallback;
}

function summarise(session: TrainingSession): string {
  const picks = session.decisions.filter((decision) => decision.kind === "select");
  const wrong = picks.filter((decision) => decision.verdict?.kind !== "correct").length;
  const hints = session.progress.reduce((sum, progress) => sum + progress.hintsUsed, 0);
  const metres = Math.round(
    session.trail.reduce((total, point, index) => {
      if (index === 0) return 0;
      const previous = session.trail[index - 1];
      const distance = Math.hypot(point[0] - previous[0], point[2] - previous[2]);
      return total + (distance < 6 ? distance : 0);
    }, 0),
  );
  return `${picks.length - wrong} correct first-time selection${picks.length - wrong === 1 ? "" : "s"}, ${wrong} learning moment${wrong === 1 ? "" : "s"}, ${hints} hint${hints === 1 ? "" : "s"}, and ${metres} m walked.`;
}
