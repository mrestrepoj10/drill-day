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

const TONE: Record<NonNullable<Marker["tone"]>, string> = {
  neutral: "border-border bg-background/85 text-foreground",
  cool: "border-interactive/50 bg-interactive/10 text-interactive",
  warm: "border-warning/50 bg-warning/10 text-warning",
  alert: "border-destructive/60 bg-destructive/10 text-destructive",
};

/**
 * HTML labels pinned to world positions, via `impl.worldToClient`.
 *
 * The Scene API has no text primitive, and building glyph geometry to put a
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
        for (const m of latest.current) {
          const el = nodes.current.get(m.id);
          if (!el) continue;
          const p = stage.project(m.point);
          if (p) {
            el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
            el.style.visibility = "visible";
          } else {
            el.style.visibility = "hidden";
          }
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
