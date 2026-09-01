"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Stage, Vec3 } from "@layer0/scene-render";

export interface Marker {
  id: string;
  point: Vec3;
  tone?: "neutral" | "cool" | "warm" | "alert";
  onSelect?: () => void;
  children: ReactNode;
}

/** Gap in pixels between a label's foot and the part it names. */
const LIFT = 12;

const TONE: Record<NonNullable<Marker["tone"]>, string> = {
  neutral: "label-neutral",
  cool: "label-cool",
  warm: "label-warm",
  alert: "label-alert",
};

/**
 * HTML labels pinned to world positions, via `impl.worldToClient`.
 *
 * three.js has no text primitive, and building glyph geometry to put a
 * temperature over a cabinet would be a poor trade. Projecting the anchor point
 * each frame and letting the DOM draw the label keeps type crisp at any zoom
 * and keeps the labels themselves selectable, which matters more here than
 * having them live in the 3D scene.
 *
 * Positions are written straight to each node's transform inside the rAF loop.
 * Routing them through React state would re-render the tree every frame, and
 * animating `left`/`top` forces layout while the 3D canvas is already painting.
 */
export function ViewerMarkers({
  getStage,
  markers,
}: {
  getStage: () => Stage | null;
  markers: Marker[];
}) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const latest = useRef(markers);
  useEffect(() => {
    latest.current = markers;
  });

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const stage = getStage();
      if (stage) {
        // Read every position and size first, write every transform after.
        // Interleaving them would force a layout per marker, on a frame where
        // the 3D canvas is already painting.
        const boxes: { el: HTMLElement; x: number; y: number; w: number; h: number }[] = [];
        for (const m of latest.current) {
          const el = nodes.current.get(m.id);
          if (!el) continue;
          const p = stage.project(m.point);
          if (!p) {
            el.style.visibility = "hidden";
            continue;
          }
          boxes.push({ el, x: p.x, y: p.y, w: el.offsetWidth, h: el.offsetHeight });
        }

        // Labels are anchored bottom-centre at their anchor point, so two
        // components a few metres apart can land on top of each other. Place
        // the lowest first and stack anything that collides above it, which
        // keeps every label readable and each one still nearest its own part.
        boxes.sort((a, b) => b.y - a.y);
        const placed: typeof boxes = [];
        for (const box of boxes) {
          for (const done of placed) {
            const apart = Math.abs(done.x - box.x) >= (done.w + box.w) / 2;
            if (apart) continue;
            const overlaps = box.y - box.h < done.y && box.y > done.y - done.h;
            if (overlaps) box.y = done.y - done.h - 6;
          }
          placed.push(box);
          // Lifted clear of the anchor: a label resting flush on the part hides
          // its top edge, which matters most when the camera has been framed on
          // that part precisely so it can be looked at.
          box.el.style.transform = `translate3d(${box.x}px, ${box.y - LIFT}px, 0) translate(-50%, -100%)`;
          box.el.style.visibility = "visible";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getStage]);

  const setNode = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  }, []);

  return (
    // The label layer sits explicitly above the WebGL canvas.
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {markers.map((m) => {
        const className = `invisible absolute left-0 top-0 rounded border px-2 py-1 text-[12px] leading-[1.4] shadow-lg backdrop-blur-sm ${
          m.onSelect
            ? "pointer-events-auto transition-[scale] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : ""
        } ${TONE[m.tone ?? "neutral"]}`;
        return m.onSelect ? (
          <button
            key={m.id}
            ref={(el) => setNode(m.id, el)}
            type="button"
            data-viewer-marker={m.id}
            aria-label={`Select ${m.id}`}
            onClick={m.onSelect}
            className={className}
          >
            {m.children}
          </button>
        ) : (
          <div key={m.id} ref={(el) => setNode(m.id, el)} className={className}>
            {m.children}
          </div>
        );
      })}
    </div>
  );
}
