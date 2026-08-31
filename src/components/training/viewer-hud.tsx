"use client";

import { ChevronDown, Map } from "lucide-react";
import { useState } from "react";
import {
  learningCueElements,
  learningCueRooms,
  type TrainingSession,
} from "@layer0/viewer-training";
import { FloorPlan } from "@/components/training/plan";
import { cn } from "@/lib/utils";

/**
 * The objective and the floor plan, on the model itself.
 *
 * Below 1500px the mission panel is a drawer, so the two things a learner needs
 * continuously — what they are being asked to do, and where they are standing —
 * are behind a button. In ChatGPT's browser panel that is the whole time. This
 * puts both back on the one always-on surface, and takes itself out of the way
 * when the drawer that owns them is open.
 *
 * It stays out of the centre: the model is what the viewer is for.
 */
export function ViewerHud({
  session,
  stageLabel,
  hidden,
}: {
  session: TrainingSession;
  /** "2 of 3 · Diagnose" — the panel's own wording for the open stage. */
  stageLabel: string;
  /** The mission drawer is open and already showing all of this. */
  hidden: boolean;
}) {
  const [open, setOpen] = useState(true);
  const step = session.step;
  if (session.status !== "running" || !step) return null;

  return (
    <div className="workspace-hud" data-hidden={hidden || undefined}>
      <div className="overflow-hidden rounded-xl border border-border bg-background/92 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <Map className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" strokeWidth={1.5} />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold leading-[1.4] text-muted-foreground">
              {stageLabel}
            </span>
            <span className="mt-0.5 block text-pretty text-[12.5px] font-medium leading-[1.45] text-foreground">
              {step.prompt}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "mt-0.5 size-3.5 shrink-0 text-text-tertiary transition-transform duration-150 [transition-timing-function:var(--ease-out)]",
              open && "rotate-180",
            )}
            aria-hidden="true"
            strokeWidth={1.5}
          />
        </button>

        {/* Mount and unmount rather than animate: this gets toggled to reclaim
            the canvas, and a panel someone opens and closes repeatedly should
            not make them wait for it. */}
        {open ? (
          <div className="border-t border-border/70 p-2">
            <div className="overflow-hidden rounded-lg border border-border/80 bg-viewer-surface p-1.5">
              <FloorPlan
                level={session.level}
                position={session.position}
                room={session.room}
                highlighted={session.revealed.flatMap((hint) => hint.reveals ?? [])}
                cueElements={session.learningCuesOn ? learningCueElements(step) : []}
                cueRooms={session.learningCuesOn ? learningCueRooms(step) : []}
                annotations={session.annotations}
                trail={session.trail}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
