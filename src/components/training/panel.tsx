"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  Lightbulb,
  MapPinned,
  RotateCcw,
  ShieldAlert,
  Timer,
} from "lucide-react";
import type { TrainingSession } from "@layer0/viewer-training";
import { ROOMS } from "@/lib/training/facility";
import { ROLES } from "@/lib/training/missions";
import { FloorPlan } from "@/components/training/plan";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
  compactOpen,
}: {
  session: TrainingSession;
  onPickRole: (role: string) => void;
  onHint: () => void;
  onSection: () => void;
  sectionOn: boolean;
  onReplay: () => void;
  replaying: boolean;
  compactOpen: boolean;
}) {
  const step = session.step;
  const mission = session.mission;
  const lastVerdict = session.decisions.findLast(
    (decision) => decision.verdict && decision.kind !== "hint",
  );
  const highlighted = session.revealed.flatMap((hint) => hint.reveals ?? []);
  const stages =
    mission?.id === "m-technician"
      ? FLAGSHIP_STAGES
      : mission?.steps.map((item) => ({
          label: item.mode === "reach" ? "Navigate" : "Select",
          detail: item.prompt,
        })) ?? [];

  return (
    <aside
      id="mission-panel"
      data-compact-open={compactOpen}
      className="workspace-mission glass-panel scrollbar-thin flex h-full min-h-0 flex-col overflow-y-auto border-r border-border"
    >
      {!mission ? (
        <MissionLaunch onPickRole={onPickRole} />
      ) : (
        <>
          <header className="border-b border-border px-5 py-4">
            <h1 className="text-balance text-[18px] font-semibold leading-[1.25] tracking-[-0.02em]">
              {mission.title}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-[1.4] text-muted-foreground">
              <span className="flex items-center gap-1.5 text-success">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" /> Live · 07:42
              </span>
              <span>Northgate Data &amp; Logistics</span>
              <span className="text-text-tertiary">
                {mission.author === "agent" ? "Agent-authored" : "Built-in scenario"}
              </span>
            </div>

            <ol className="mt-3 flex items-center gap-1.5" aria-label="Mission progress">
              {stages.map((stage, index) => {
                const cleared = session.progress[index]?.cleared;
                const current = index === session.stepIndex && session.status === "running";
                return (
                  <li key={`${stage.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 ? <span className="h-px w-3 shrink-0 bg-border" aria-hidden="true" /> : null}
                    <span
                      aria-hidden="true"
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold ${
                        cleared
                          ? "border-success/40 bg-success/15 text-success"
                          : current
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {cleared ? "✓" : index + 1}
                    </span>
                    <span
                      className={`truncate text-[11px] font-semibold ${current ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {stage.label}
                      {current ? <span className="sr-only">, current step</span> : null}
                      {cleared ? <span className="sr-only">, cleared</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </header>

          <section className="border-b border-border px-5 py-4">
            {step ? (
              <>
                <h2 className="text-[13px] font-semibold leading-[1.4]">
                  Step {session.stepIndex + 1} — {step.mode === "reach" ? "Navigate" : "Select component"}
                </h2>
                <p className="mt-2 text-pretty text-[15px] font-medium leading-[1.5] tracking-[-0.01em]">
                  {clearerPrompt(mission.id, session.stepIndex, step.prompt)}
                </p>
                {step.allowedTools ? (
                  <div className="mt-3 flex gap-2.5 rounded-lg border border-warning/30 bg-warning/8 p-3">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                    <div>
                      <p className="text-[13px] font-semibold leading-[1.4] text-warning">Search is disabled</p>
                      <p className="mt-1 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                        The learner and agent must reason from the building, hints, and system context.
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div>
                <div className="flex items-center gap-2 text-[13px] font-semibold text-success">
                  <CheckCircle2 className="size-4" aria-hidden="true" /> Mission complete
                </div>
                <p className="mt-2 text-pretty text-[15px] leading-[1.5]">{summarise(session)}</p>
              </div>
            )}
          </section>

          {lastVerdict?.verdict ? (
            <section
              aria-live="polite"
              className={`surface-pop border-b border-border px-5 py-4 ${
                lastVerdict.verdict.kind === "correct"
                  ? "bg-success/6"
                  : lastVerdict.verdict.kind === "near"
                    ? "bg-warning/6"
                    : "bg-destructive/6"
              }`}
            >
              <h2 className="text-[13px] font-semibold leading-[1.4]">Latest feedback</h2>
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

          <Collapsible className="border-b border-border">
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-surface-hover">
              <span>
                <span className="block text-[13px] font-semibold leading-[1.4]">Live floor plan</span>
                <span className="mt-0.5 block text-[12px] leading-[1.4] text-muted-foreground">
                  {session.room
                    ? ROOMS.find((room) => room.id === session.room)?.name
                    : "Outside the building"}
                </span>
              </span>
              <span className="flex items-center gap-2 text-[11px] text-text-tertiary">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={-1} className="flex items-center gap-1.5">
                      <MapPinned className="size-3" aria-hidden="true" /> level {session.level}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6} className="max-w-52 text-pretty">
                    Position and route are live. Reach objectives must be walked in the 3D scene.
                  </TooltipContent>
                </Tooltip>
                <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-5 pb-4">
              <div className="overflow-hidden rounded-xl border border-border bg-viewer-surface p-2">
                <FloorPlan
                  level={session.level}
                  position={session.position}
                  room={session.room}
                  highlighted={highlighted}
                  trail={session.trail}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {session.coaching.length ? (
            <section className="surface-pop border-b border-border px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <Bot className="size-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-[13px] font-semibold leading-[1.4]">Coach</h2>
              </div>
              <p className="text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                {session.coaching.at(-1)?.text}
              </p>
            </section>
          ) : null}

          <div className="mt-auto p-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onPickRole("")}
              className="h-10 w-full text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Change training scenario
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}

function MissionLaunch({ onPickRole }: { onPickRole: (role: string) => void }) {
  const otherRoles = ROLES.filter((role) => role.id !== "technician");
  const [rolePickerOpen, setRolePickerOpen] = useState(false);

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
        <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/70 px-5 py-2.5">
          <span className="font-mono text-[11px] text-white/80">
            Live callout · 07:42
          </span>
        </div>
      </div>

      <section className="px-5 py-5">
        <h1 className="text-balance text-[24px] font-semibold leading-[1.15] tracking-[-0.03em]">
          Train inside the building—not from a manual.
        </h1>
        <div className="mt-2 text-[12px] leading-[1.4] text-text-tertiary">Northgate Data &amp; Logistics</div>
        <p className="mt-3 max-w-[42ch] text-pretty text-[14px] leading-[1.5] text-muted-foreground">
          Walk to Room 214, diagnose a chilled-water leak, and isolate the right valve. Your agent shares the live scene, coaches the learner, and can author the next drill.
        </p>

        <ol className="mt-5 grid grid-cols-3 divide-x divide-border border-y border-border" aria-label="Drill stages">
          {FLAGSHIP_STAGES.map((stage, index) => (
            <li key={stage.label} className="px-2.5 py-3 first:pl-0 last:pr-0">
              <span className="block text-[13px] font-semibold leading-[1.4]">{stage.label}</span>
              <span className="mt-1 block text-[12px] leading-[1.4] text-muted-foreground">{stage.detail}</span>
              <span className="sr-only">Step {index + 1}</span>
            </li>
          ))}
        </ol>

        <Button
          type="button"
          onClick={() => onPickRole("technician")}
          className="group mt-5 h-11 w-full justify-between px-4 text-[13px] font-semibold hover:bg-white"
        >
          <span className="flex items-center gap-2">
            <Timer className="size-4" aria-hidden="true" /> Start the 90-second drill
          </span>
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Button>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-pretty text-[13px] leading-[1.5] text-muted-foreground">
            <b className="text-foreground">WebMCP changes the lesson.</b> The agent can inspect the live model and guide without bypassing the exercise rules.
          </p>
        </div>
      </section>

      <div className="mt-auto border-t border-border p-3">
        <Popover open={rolePickerOpen} onOpenChange={setRolePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="group h-auto w-full justify-between px-2 py-2 text-left font-normal"
            >
              <span>
                <span className="block text-[13px] font-semibold leading-[1.4]">Explore scenarios</span>
                <span className="mt-0.5 block text-[12px] leading-[1.4] text-muted-foreground">
                  Six specialist roles
                </span>
              </span>
              <ChevronRight
                className="size-4 text-text-tertiary transition-transform group-data-[state=open]:rotate-90"
                aria-hidden="true"
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="right"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className="w-[min(360px,calc(100vw-1.5rem))] gap-0 p-0"
          >
            <Command>
              <CommandInput placeholder="Search training scenarios…" />
              <CommandList className="max-h-[min(430px,calc(100dvh-6rem))]">
                <CommandEmpty>No matching scenario.</CommandEmpty>
                <CommandGroup heading="Specialist drills">
                  {otherRoles.map((role) => (
                    <CommandItem
                      key={role.id}
                      value={`${role.label} ${role.blurb}`}
                      onSelect={() => {
                        setRolePickerOpen(false);
                        onPickRole(role.id);
                      }}
                      className="items-start gap-3 px-3 py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold leading-[1.4]">{role.label}</span>
                        <span className="mt-0.5 block whitespace-normal text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                          {role.blurb}
                        </span>
                      </span>
                      <ArrowRight className="mt-0.5 size-3.5 text-text-tertiary" aria-hidden="true" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
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
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`h-auto min-h-16 flex-col items-start justify-between gap-2 p-2.5 text-left font-normal ${
        active
          ? "border-foreground/40 bg-muted text-foreground"
          : "bg-muted/15 text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="whitespace-normal text-[12px] font-semibold leading-[1.3]">{label}</span>
    </Button>
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
