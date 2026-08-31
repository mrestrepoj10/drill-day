"use client";

import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/**
 * How looking around works at this moment: `click` takes the pointer, `drag`
 * is the fallback wherever the lock cannot be had — an iframe without
 * `allow-pointer-lock`, a host that does not implement it, or a touch screen.
 */
export type LookMode = "click" | "drag";

/**
 * The walk-mode controls, drawn on the canvas.
 *
 * First person costs the learner their cursor, so the page owes them three
 * sentences at three different moments, and none of them belong in a top bar
 * that reads as decoration by the second minute:
 *
 * 1. Before the lock — an invitation, because a click spent engaging the
 *    camera silently reads as "clicking does not work".
 * 2. While locked — Escape, permanently. Chrome shows its own "has control of
 *    your cursor" banner and no API can hide it; the only thing that turns
 *    that banner from a surprise into a confirmation is the page having said
 *    the same thing first, in its own voice, for as long as the lock is held.
 * 3. Whatever the state, the movement keys — quietly, because they are a
 *    reference and not a call to action.
 */
export function WalkControls({
  walking,
  looking,
  mode,
  onLook,
}: {
  /** The learner is in first person. */
  walking: boolean;
  /** The viewer is holding the pointer. */
  looking: boolean;
  mode: LookMode;
  /** Take the pointer. Called from a real click, which is what the API needs. */
  onLook: () => void;
}) {
  if (!walking) return null;

  if (looking) {
    return (
      <div className="walk-bar">
        <div
          className="surface-pop flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full border border-border bg-background/95 py-1.5 pl-1.5 pr-3 backdrop-blur-md"
          role="status"
        >
          {/* Inverted, because this is the one thing on screen that has to be
              read without being looked for. Monochrome: it is chrome and
              state, not a verdict and not an agent accent. */}
          <span className="flex items-center gap-2 rounded-full bg-foreground py-1 pl-1.5 pr-2.5 text-background">
            <Kbd className="bg-background/20 text-background">Esc</Kbd>
            <span className="text-[12px] font-semibold leading-none">release the cursor</span>
          </span>
          <MoveKeys className="walk-bar-keys" />
        </div>
      </div>
    );
  }

  if (mode === "drag") {
    return (
      <div className="walk-bar">
        <div className="surface-pop flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full border border-border bg-background/90 px-3 py-1.5 backdrop-blur-md">
          <span className="text-[12px] font-medium leading-none">Drag to look around</span>
          <MoveKeys />
        </div>
      </div>
    );
  }

  return (
    // Centred, and only until the lock is taken: this is the call to action
    // that stops the first click being spent in silence.
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="surface-pop pointer-events-auto flex max-w-[min(20rem,100%)] flex-col items-center gap-2.5 rounded-xl border border-border bg-background/95 px-5 py-4 text-center backdrop-blur-md">
        <Button type="button" size="sm" onClick={onLook}>
          <Eye className="size-3.5" aria-hidden="true" />
          Click to look around
        </Button>
        <MoveKeys />
        <p className="text-[11px] leading-[1.5] text-text-tertiary">
          <Kbd className="mr-1">Esc</Kbd>
          gives the cursor back whenever you want it
        </p>
      </div>
    </div>
  );
}

/** The movement reference. Quiet everywhere it appears. */
function MoveKeys({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-3 text-[11px] leading-none text-muted-foreground", className)}>
      <span className="flex items-center gap-1.5">
        <KbdGroup>
          <Kbd>W</Kbd>
          <Kbd>A</Kbd>
          <Kbd>S</Kbd>
          <Kbd>D</Kbd>
        </KbdGroup>
        move
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>Shift</Kbd>
        sprint
      </span>
    </span>
  );
}
