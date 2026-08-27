"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  cool: "border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warm: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  alert: "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300",
};

/**
 * HTML labels pinned to world positions, via `impl.worldToClient`.
 *
 * The Scene API has no text primitive, and building glyph geometry to put a
 * temperature over a cabinet would be a poor trade. Projecting the anchor point
 * each frame and letting the DOM draw the label keeps type crisp at any zoom
 * and keeps the labels themselves selectable, which matters more here than
 * having them live in the 3D scene.
 */
export function ViewerMarkers({
  getStage,
  markers,
}: {
  getStage: () => Stage | null;
  markers: Marker[];
}) {
  const [screen, setScreen] = useState<Record<string, { x: number; y: number }>>({});
  const latest = useRef(markers);
  useEffect(() => {
    latest.current = markers;
  });

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const stage = getStage();
      if (stage) {
        const next: Record<string, { x: number; y: number }> = {};
        for (const m of latest.current) {
          const p = stage.project(m.point);
          if (p) next[m.id] = p;
        }
        setScreen(next);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getStage]);

  return (
    // LMV gives its own canvas layers a stacking order inside the viewer
    // container, so the label layer has to sit explicitly above them.
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {markers.map((m) => {
        const p = screen[m.id];
        if (!p) return null;
        const className = `absolute -translate-x-1/2 -translate-y-full rounded border px-2 py-1 text-[10px] leading-tight shadow-lg backdrop-blur-sm ${
          m.onSelect ? "pointer-events-auto transition hover:scale-105" : ""
        } ${TONE[m.tone ?? "neutral"]}`;
        return m.onSelect ? (
          <button
            key={m.id}
            type="button"
            data-viewer-marker={m.id}
            aria-label={`Select ${m.id}`}
            onClick={m.onSelect}
            style={{ left: p.x, top: p.y }}
            className={className}
          >
            {m.children}
          </button>
        ) : (
          <div key={m.id} style={{ left: p.x, top: p.y }} className={className}>
            {m.children}
          </div>
        );
      })}
    </div>
  );
}
