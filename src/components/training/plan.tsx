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
  cueElements,
  cueRooms,
  trail,
  onPickRoom,
}: {
  level: number;
  position?: Vec3;
  room?: string;
  highlighted: string[];
  cueElements: string[];
  cueRooms: string[];
  trail: Vec3[];
  onPickRoom?: (roomId: string) => void;
}) {
  const w = FOOTPRINT.x + PAD * 2;
  const h = FOOTPRINT.z + PAD * 2;
  const rooms = ROOMS.filter((r) => r.level === level);
  const markedIds = new Set([...cueElements, ...highlighted]);
  const marks = ELEMENTS.filter((e) => e.level === level && markedIds.has(e.id));
  const here = trail.filter(
    (p) => Math.abs(p[1] - 1.7 - level * 4) < 2 && p[0] > -20 && p[0] < 70,
  );

  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${w} ${h}`}
      className="w-full"
      role="img"
      aria-label={`Plan of level ${level}${cueElements.length || cueRooms.length ? ", with learning cues" : ""}`}
    >
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
            {cueRooms.includes(r.id) ? (
              <rect
                x={x0}
                y={z0}
                width={x1 - x0}
                height={z1 - z0}
                className="pointer-events-none fill-interactive/10 stroke-interactive"
                strokeWidth={0.45}
              />
            ) : null}
            <text
              x={(x0 + x1) / 2}
              y={(z0 + z1) / 2 + 0.5}
              textAnchor="middle"
              fontSize={r.id.startsWith("RISER") ? 1.1 : 1.5}
              className="fill-muted-foreground"
              style={{ fontFamily: "var(--font-mono)" }}
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
          stroke="var(--interactive)"
          strokeWidth={0.35}
          strokeOpacity={0.8}
        />
      )}

      {marks.map((m) => {
        const revealed = highlighted.includes(m.id);
        return (
          <circle
            key={m.id}
            cx={m.position[0]}
            cy={m.position[2]}
            r={revealed ? 0.9 : 0.75}
            fill={revealed
              ? `#${(SYSTEM_COLOR[m.system] ?? 0x888888).toString(16).padStart(6, "0")}`
              : "var(--interactive)"}
            stroke={revealed ? "var(--warning)" : "var(--background)"}
            strokeWidth={revealed ? 0.4 : 0.3}
          />
        );
      })}

      {position && Math.abs(position[1] - 1.7 - level * 4) < 2 && (
        <g>
          <circle cx={position[0]} cy={position[2]} r={1.1} fill="var(--interactive)" />
          <circle cx={position[0]} cy={position[2]} r={2.2} fill="none" stroke="var(--interactive)" strokeWidth={0.3} strokeOpacity={0.5} />
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
