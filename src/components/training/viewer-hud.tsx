"use client";

import { ChevronDown, Map } from "lucide-react";
import { useState } from "react";
import {
  learningCueElements,
  learningCueRooms,
  type TrainingSession,
} from "@layer0/viewer-training";
import { FloorPlan } from "@/components/training/plan";
import { Button } from "@/components/ui/button";

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

  // Collapsed it is a single icon: the model is what the viewer is for, and
  // someone who has read the objective should be able to get the canvas back
  // without the panel leaving a footprint behind.
  if (!open) {
    return (
      <div className="workspace-hud" data-collapsed="" data-hidden={hidden || undefined}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label="Show the objective and floor plan"
          className="size-9 rounded-xl border border-border/70 bg-background/55 backdrop-blur-md hover:bg-background/75"
        >
          <Map className="size-4 text-muted-foreground" aria-hidden="true" strokeWidth={1.5} />
        </Button>
      </div>
    );
  }

  return (
    <div className="workspace-hud" data-hidden={hidden || undefined}>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-background/55 backdrop-blur-xl">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
          aria-expanded
          // Square, because the card it sits in owns the radius and clips it.
          className="h-auto w-full items-start justify-start gap-2 rounded-none px-3 py-2.5 text-left font-normal"
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
          <ChevronDown className="mt-0.5 size-3.5 shrink-0 rotate-180 text-text-tertiary" aria-hidden="true" strokeWidth={1.5} />
        </Button>

        <div className="border-t border-border/60 p-2">
          <div className="overflow-hidden rounded-lg border border-border/60 bg-viewer-surface/70 p-1.5">
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
      </div>
    </div>
  );
}
