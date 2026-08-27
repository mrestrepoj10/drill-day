"use client";

import { ELEMENTS, FOOTPRINT, ROOMS, SYSTEM_COLOR } from "@/lib/training/facility";
import type { Vec3 } from "@layer0/viewer-training";

const PAD = 3;

/**
 * The related drawing.
 *
 * Not a picture of the model — a plan drawn from the same catalogue the model
 * is drawn from, so it cannot drift out of step with it. It is here because
 * asking "where am I" is a two-dimensional question, and answering it in
 * perspective is the reason people get lost in walkthroughs.
 */
export function FloorPlan({
  level,
  position,
  room,
  highlighted,
  trail,
  onPickRoom,
}: {
  level: number;
  position?: Vec3;
  room?: string;
  highlighted: string[];
  trail: Vec3[];
  onPickRoom?: (roomId: string) => void;
}) {
  const w = FOOTPRINT.x + PAD * 2;
  const h = FOOTPRINT.z + PAD * 2;
  const rooms = ROOMS.filter((r) => r.level === level);
  const marks = ELEMENTS.filter((e) => e.level === level && highlighted.includes(e.id));
  const here = trail.filter(
    (p) => Math.abs(p[1] - 1.7 - level * 4) < 2 && p[0] > -20 && p[0] < 70,
  );

  return (
    <svg viewBox={`${-PAD} ${-PAD} ${w} ${h}`} className="w-full" role="img" aria-label={`Plan of level ${level}`}>
      <rect x={-PAD} y={-PAD} width={w} height={h} className="fill-muted/40" />
      {rooms.map((r) => {
        const [x0, z0, x1, z1] = r.bounds;
        const active = r.id === room;
        return (
          <g key={r.id} onClick={() => onPickRoom?.(r.id)} className={onPickRoom ? "cursor-pointer" : ""}>
            <rect
              x={x0}
              y={z0}
              width={x1 - x0}
              height={z1 - z0}
              className={active ? "fill-foreground/15 stroke-foreground" : "fill-background stroke-border"}
              strokeWidth={0.28}
            />
            <text
              x={(x0 + x1) / 2}
              y={(z0 + z1) / 2 + 0.5}
              textAnchor="middle"
              fontSize={r.id.startsWith("RISER") ? 1.1 : 1.5}
              className="fill-muted-foreground"
              style={{ fontFamily: "var(--font-geist-mono), monospace" }}
            >
              {shortName(r.name)}
            </text>
          </g>
        );
      })}

      {here.length > 1 && (
        <polyline
          points={here.map((p) => `${p[0]},${p[2]}`).join(" ")}
          fill="none"
          stroke="#2f80d8"
          strokeWidth={0.35}
          strokeOpacity={0.8}
        />
      )}

      {marks.map((m) => (
        <circle
          key={m.id}
          cx={m.position[0]}
          cy={m.position[2]}
          r={0.9}
          fill={`#${(SYSTEM_COLOR[m.system] ?? 0x888888).toString(16).padStart(6, "0")}`}
          stroke="#f0b429"
          strokeWidth={0.4}
        />
      ))}

      {position && Math.abs(position[1] - 1.7 - level * 4) < 2 && (
        <g>
          <circle cx={position[0]} cy={position[2]} r={1.1} fill="#2f80d8" />
          <circle cx={position[0]} cy={position[2]} r={2.2} fill="none" stroke="#2f80d8" strokeWidth={0.3} strokeOpacity={0.5} />
        </g>
      )}
    </svg>
  );
}

function shortName(name: string): string {
  return name
    .replace("Electrical switchroom", "Switchroom")
    .replace("First floor corridor", "Corridor")
    .replace("Ground corridor", "Corridor")
    .replace("Riser cupboard GF", "Riser")
    .replace("Riser cupboard 1F", "Riser")
    .replace("AHU plant room", "AHU plant");
}
