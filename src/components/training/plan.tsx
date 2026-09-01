"use client";

import { useEffect, useState } from "react";
import { ELEMENT_BY_ID, ELEMENTS, FOOTPRINT, ROOMS, SYSTEM_COLOR } from "@/lib/training/facility";
import type { Annotation, Vec3 } from "@layer0/viewer-training";

const PAD = 3;
/** How long a walked point stays on the plan before it has fully faded. */
const TRAIL_LIFE_MS = 60_000;
/** The last stretch of that life over which it fades out. */
const TRAIL_FADE_MS = 25_000;

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
  destination,
  trail,
  annotations = [],
  onPickRoom,
}: {
  level: number;
  position?: Vec3;
  room?: string;
  highlighted: string[];
  cueElements: string[];
  cueRooms: string[];
  /** Room id a `reach` step is asking for, on this level or another. */
  destination?: string;
  trail: { at: number; point: Vec3 }[];
  /** Notes the agent has pinned, in the order it pinned them. */
  annotations?: Annotation[];
  onPickRoom?: (roomId: string) => void;
}) {
  // Drawing only this storey means a destination upstairs is simply absent,
  // which reads as "there is nowhere to go" rather than "not on this floor".
  const target = destination ? ROOMS.find((r) => r.id === destination) : undefined;
  const destinationElsewhere = target && target.level !== level ? target : undefined;

  const w = FOOTPRINT.x + PAD * 2;
  const h = FOOTPRINT.z + PAD * 2;
  const rooms = ROOMS.filter((r) => r.level === level);
  const markedIds = new Set([...cueElements, ...highlighted]);
  const marks = ELEMENTS.filter((e) => e.level === level && markedIds.has(e.id));

  // A note belongs to the storey its element sits on, and this drawing is one
  // storey. Numbering runs across the whole set so note 3 on the plan is note 3
  // in the agent's briefing, and the ones that fall off this drawing are
  // counted rather than silently dropped — a note you cannot see is worse than
  // no note, because it reads as advice that does not exist.
  const notes = annotations.flatMap((note, i) => {
    const element = ELEMENT_BY_ID.get(note.id);
    return element ? [{ ...note, ordinal: i + 1, element }] : [];
  });
  const notesHere = notes.filter((n) => n.element.level === level);
  const notesElsewhere = new Map<number, number>();
  for (const n of notes) {
    if (n.element.level === level) continue;
    notesElsewhere.set(n.element.level, (notesElsewhere.get(n.element.level) ?? 0) + 1);
  }

  // The route is working memory, not a record: it fades away behind the
  // learner. A slow tick keeps the fade advancing while they stand still.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 4000);
    return () => clearInterval(timer);
  }, []);
  const here = trail.filter(
    ({ at, point: p }) =>
      now - at < TRAIL_LIFE_MS &&
      Math.abs(p[1] - 1.7 - level * 4) < 2 &&
      p[0] > -20 &&
      p[0] < 70,
  );

  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${w} ${h}`}
      className="w-full"
      role="img"
      aria-label={
        `Plan of level ${level}` +
        (cueElements.length || cueRooms.length ? ", with learning cues" : "") +
        (destinationElsewhere ? `, destination ${destinationElsewhere.name} on level ${destinationElsewhere.level}` : "") +
        (notesHere.length ? `, with ${notesHere.length} pinned note${notesHere.length > 1 ? "s" : ""}` : "")
      }
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
            {r.id === destination ? (
              // Where you are being sent, marked like an answer rather than a
              // cue: on a navigation step it is the whole objective.
              <rect
                x={x0}
                y={z0}
                width={x1 - x0}
                height={z1 - z0}
                className="pointer-events-none fill-success/10 stroke-success"
                strokeWidth={0.5}
                strokeDasharray="1.2 0.8"
              />
            ) : null}
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

      {here.length > 1 &&
        here.slice(1).map(({ at, point: p }, i) => {
          const prev = here[i].point;
          if (Math.hypot(p[0] - prev[0], p[2] - prev[2]) > 6) return null;
          const age = now - at;
          const fade = Math.min(
            1,
            Math.max(0, (TRAIL_LIFE_MS - age) / TRAIL_FADE_MS),
          );
          return (
            <line
              key={at + ":" + i}
              x1={prev[0]}
              y1={prev[2]}
              x2={p[0]}
              y2={p[2]}
              stroke="var(--interactive)"
              strokeWidth={0.35}
              strokeLinecap="round"
              strokeOpacity={0.8 * fade}
              style={{ transition: "stroke-opacity 4s linear" }}
            />
          );
        })}

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
            className={revealed ? undefined : "plan-cue"}
          />
        );
      })}

      {/* A note is neither a cue nor a verdict, so it is not another dot: a
          numbered tag in the agent's blue, which the learner reads as "someone
          said something about this" rather than "answer here". */}
      {notesHere.map((n) => (
        <g key={n.id}>
          <title>{`${n.ordinal}. ${n.element.name} — ${n.note}`}</title>
          <rect
            x={n.element.position[0] - 1.05}
            y={n.element.position[2] - 1.05}
            width={2.1}
            height={2.1}
            rx={0.35}
            transform={`rotate(45 ${n.element.position[0]} ${n.element.position[2]})`}
            fill="var(--interactive)"
            stroke="var(--background)"
            strokeWidth={0.32}
          />
          <text
            x={n.element.position[0]}
            y={n.element.position[2] + 0.48}
            textAnchor="middle"
            fontSize={1.35}
            fill="var(--background)"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {n.ordinal}
          </text>
        </g>
      ))}

      {destinationElsewhere ? (
        <text
          x={-PAD + 0.6}
          y={-PAD + 1.9}
          fontSize={1.5}
          className="fill-success"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {`${destinationElsewhere.name} is on level ${destinationElsewhere.level}`}
        </text>
      ) : null}

      {notesElsewhere.size > 0 ? (
        <text
          x={-PAD + 0.6}
          y={FOOTPRINT.z + PAD - 0.9}
          fontSize={1.5}
          className="fill-muted-foreground"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {[...notesElsewhere.entries()]
            .sort(([a], [b]) => a - b)
            .map(([other, count]) => `${count} more note${count > 1 ? "s" : ""} on level ${other}`)
            .join(" · ")}
        </text>
      ) : null}

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
