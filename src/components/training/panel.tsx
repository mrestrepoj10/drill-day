"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Eye,
  Lightbulb,
  MapPinned,
  RotateCcw,
  ScanSearch,
  Timer,
} from "lucide-react";
import type { RegisteredTool } from "@layer0/webmcp";
import {
  learningCueElements,
  learningCueRooms,
  type TrainingSession,
} from "@layer0/viewer-training";
import { ROOMS } from "@/lib/training/facility";
import { ROLES } from "@/lib/training/missions";
import { MissionDebrief } from "@/components/training/mission-debrief";
import {
  MissionProgress,
  type MissionStageView,
} from "@/components/training/mission-progress";
import { FloorPlan } from "@/components/training/plan";
import { SuggestedPrompt } from "@/components/training/suggested-prompt";
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
  challengeLabel,
  roleLabel,
  onLearningCues,
  tools,
}: {
  session: TrainingSession;
  onPickRole: (role: string) => void;
  onHint: () => void;
  onSection: () => void;
  sectionOn: boolean;
  onReplay: () => void;
  replaying: boolean;
  compactOpen: boolean;
  challengeLabel: string;
  roleLabel: string;
  onLearningCues: () => void;
  /** Everything currently registered on `navigator.modelContext`. */
  tools: RegisteredTool[];
}) {
  const step = session.step;
  const mission = session.mission;
  const latestCoach = session.coaching.at(-1);
  const highlighted = session.revealed.flatMap((hint) => hint.reveals ?? []);
  const cueElements = session.learningCuesOn ? learningCueElements(step) : [];
  const cueRooms = session.learningCuesOn ? learningCueRooms(step) : [];
  const stages: MissionStageView[] = mission?.steps.map((item, index) => ({
    id: item.id,
    label: mission.id === "m-technician"
      ? FLAGSHIP_STAGES[index]?.label ?? `Stage ${index + 1}`
      : item.mode === "reach"
        ? "Navigate"
        : "Select",
    prompt: item.prompt,
  })) ?? [];

  return (
    <aside
      id="mission-panel"
      data-compact-open={compactOpen}
      className="workspace-mission glass-panel scrollbar-thin flex h-full min-h-0 flex-col overflow-y-auto border-r border-border"
    >
      {!mission ? (
        <MissionLaunch onPickRole={onPickRole} toolCount={tools.length} />
      ) : (
        <>
          <header className="border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.12em] text-text-tertiary">
              <span>{challengeLabel}</span>
              <span className="text-border" aria-hidden="true">/</span>
              <span>{roleLabel}</span>
            </div>
            <h1 className="mt-1.5 text-balance text-[18px] font-semibold leading-[1.25] tracking-[-0.02em]">
              {mission.title}
            </h1>
          </header>

          {step ? (
            <>
              <MissionProgress session={session} stages={stages} tools={tools} />
              <MissionControls
                session={session}
                onHint={onHint}
                onSection={onSection}
                sectionOn={sectionOn}
                onLearningCues={onLearningCues}
                onReplay={onReplay}
                replaying={replaying}
              />
            </>
          ) : (
            <MissionDebrief session={session} onReplay={onReplay} replaying={replaying} />
          )}

          <Collapsible defaultOpen className="border-b border-border/70 bg-muted/[0.03]">
            <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 py-3 text-left text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">
              <span>
                <span className="block text-[12px] font-semibold leading-[1.4]">Live floor plan</span>
                <span className="mt-0.5 block text-[11px] leading-[1.4] text-text-tertiary">
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
            <CollapsibleContent className="px-4 pb-3">
              <div className="overflow-hidden rounded-lg border border-border/80 bg-viewer-surface p-2">
                <FloorPlan
                  level={session.level}
                  position={session.position}
                  room={session.room}
                  highlighted={highlighted}
                  cueElements={cueElements}
                  cueRooms={cueRooms}
                  trail={session.trail}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {latestCoach ? (
            <section
              key={latestCoach.at}
              className="surface-pop border-b border-border/70 bg-muted/[0.025] px-4 py-3"
            >
              <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
                <Bot className="size-3.5" aria-hidden="true" />
                <h2 className="text-[11px] font-semibold leading-[1.4]">Coach</h2>
              </div>
              <p className="text-pretty text-[11px] leading-[1.5] text-text-tertiary">
                {latestCoach.text}
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

function MissionLaunch({
  onPickRole,
  toolCount,
}: {
  onPickRole: (role: string) => void;
  toolCount: number;
}) {
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
          <ArrowRight className="workspace-action-arrow size-4" aria-hidden="true" />
        </Button>

        {/* The cold start: what to paste, and what the page will refuse to do
            with it. A judge who reads nothing else should still get the idea. */}
        <div className="mt-5 rounded-lg border border-border p-3.5">
          <div className="flex items-center gap-2">
            <Bot className="size-3.5 text-interactive" aria-hidden="true" />
            <h2 className="text-[12px] font-semibold leading-[1.4]">Bring your agent</h2>
            {toolCount ? (
              <span className="ml-auto font-mono text-[11px] leading-[1.4] text-text-tertiary">
                {toolCount} site tools
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-pretty text-[13px] leading-[1.5] text-muted-foreground">
            It can read everything on this page except the answer. Each stage decides which
            tools it may use, and the refusals are logged where you can see them.
          </p>
          <div className="mt-3 border-t border-border pt-3">
            <SuggestedPrompt />
          </div>
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
  accent,
}: {
  icon: typeof Lightbulb;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  accent?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`h-8 gap-2 px-2 text-[11px] font-medium ${
        active
          ? accent
            ? "bg-interactive/10 text-interactive hover:bg-interactive/15 hover:text-interactive"
            : "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}

function MissionControls({
  session,
  onHint,
  onSection,
  sectionOn,
  onLearningCues,
  onReplay,
  replaying,
}: {
  session: TrainingSession;
  onHint: () => void;
  onSection: () => void;
  sectionOn: boolean;
  onLearningCues: () => void;
  onReplay: () => void;
  replaying: boolean;
}) {
  const step = session.step;
  if (!step) return null;

  const hintsRemaining = step.hints.length - session.hintsUsed;
  const canReplay = session.decisions.some((decision) => decision.verdict);
  const hasLearningCues = learningCueElements(step).length > 0 || learningCueRooms(step).length > 0;

  return (
    <section aria-label="Mission controls" className="border-b border-border/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {hasLearningCues ? (
          <MissionControl
            icon={ScanSearch}
            label={session.learningCuesOn ? "Cues on" : "Cues off"}
            onClick={onLearningCues}
            active={session.learningCuesOn}
            accent
          />
        ) : null}
        {hintsRemaining > 0 ? (
          <MissionControl
            icon={Lightbulb}
            label={`Hint · ${hintsRemaining}`}
            onClick={onHint}
          />
        ) : null}
        <MissionControl
          icon={Eye}
          label={sectionOn ? "Restore ceiling" : "Open ceiling"}
          onClick={onSection}
          active={sectionOn}
        />
        {canReplay ? (
          <MissionControl
            icon={RotateCcw}
            label={replaying ? "Replaying…" : "Replay"}
            onClick={onReplay}
            disabled={replaying}
          />
        ) : null}
      </div>
    </section>
  );
}
