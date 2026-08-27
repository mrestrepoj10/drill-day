"use client";

import Link from "next/link";
import {
  Activity,
  GitFork,
  MousePointer2,
  PanelLeft,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Stage } from "@layer0/scene-render";
import { useModelContextTools } from "@layer0/webmcp";
import { loadTraining, type TrainingSession, type ViewerTraining } from "@layer0/viewer-training";
import { ELEMENT_BY_ID, EYE, LEVELS, ROOMS, STOREY } from "@/lib/training/facility";
import { MISSIONS, ROLES } from "@/lib/training/missions";
import { trainingTools } from "@/lib/training/tools";
import { TrainingScene } from "@/components/training/scene";
import { TrainingPanel } from "@/components/training/panel";
import { AgentConsole, type Drill } from "@/components/agent-console";
import { StageStatus, useStage } from "@/components/use-stage";
import { ViewerMarkers, type Marker } from "@/components/viewer-markers";

const CUTAWAY_Y = LEVELS * STOREY - 0.6;
const OVERVIEW = Stage.frame([24, 3, 16], 82, -1.05, 0.66);

const IDLE: TrainingSession = {
  version: 0,
  stepIndex: 0,
  status: "idle",
  attempts: 0,
  hintsUsed: 0,
  revealed: [],
  decisions: [],
  progress: [],
  level: 0,
  coaching: [],
  trail: [],
};

const DRILLS: Drill[] = [
  {
    label: "Start + inspect flagship",
    hint: "An agent starts the leak drill, reads live state, then coaches.",
    steps: [
      { tool: "training_start_mission", input: { role: "technician" }, pause: 900 },
      { tool: "training_get_session", pause: 450 },
      { tool: "training_say", input: { text: "Take your time. Read the room signs as you pass them." } },
    ],
  },
  {
    label: "Prove the guardrail",
    hint: "A forbidden locate call is refused, while inspection and hints remain available.",
    steps: [
      { tool: "training_locate_element", input: { id: "CHW-VLV-L1" }, pause: 500 },
      { tool: "training_inspect_element", input: { id: "CHW-DROP-214" }, pause: 500 },
      { tool: "training_give_hint" },
    ],
  },
  {
    label: "Agent-authored drill",
    hint: "Browse real fire assets, then compose and launch a grounded two-step exercise.",
    steps: [
      { tool: "training_start_mission", input: { role: "firefighter" }, pause: 450 },
      { tool: "training_list_elements", input: { system: "fire" }, pause: 600 },
      {
        tool: "training_author_mission",
        input: {
          title: "Cold start: fire equipment",
          brief: "You have never been in this building and the alarm is going. Find the two things that matter first.",
          role: "firefighter",
          steps: [
            {
              prompt: "Select the panel that will tell you where the alarm came from.",
              mode: "select",
              selectIds: ["FIRE-PANEL-01"],
              nearMisses: [
                {
                  id: "ELEC-DB-01",
                  diagnosis: "That is the electrical board. The fire panel is by the entrance, not in the switchroom.",
                },
              ],
              hints: ["It is on the corridor wall, a few metres in from the west exit."],
              successMessage: "Fire alarm panel, inside the final exit where it should be.",
              startAtRoom: "CORR-L0",
            },
            {
              prompt: "Now get to the first-floor landing valve.",
              mode: "reach",
              destinationRoom: "CORE-L1",
              hints: ["The riser runs up the stair core at the south-east corner."],
              successMessage: "Landing valve reached.",
              forbidSearch: true,
            },
          ],
        },
        pause: 900,
      },
      { tool: "training_get_session" },
    ],
  },
];

type PickNotice = { message: string; tone: "neutral" | "good" | "near" | "bad" };
type HoverLabel = { id: string; name: string; system: string; x: number; y: number };

export function TrainingDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TrainingScene | null>(null);
  const hoverFrame = useRef<number | null>(null);
  const [training, setTraining] = useState<ViewerTraining | null>(null);
  const [roleId, setRoleId] = useState("");
  const [sectionOn, setSectionOn] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [notice, setNotice] = useState<PickNotice>();
  const [hover, setHover] = useState<HoverLabel>();
  const [missionPaneOpen, setMissionPaneOpen] = useState(false);
  const [activityPaneOpen, setActivityPaneOpen] = useState(false);

  const { getStage, status, error } = useStage(containerRef, (stage, handle) => {
    const scene = new TrainingScene(stage);
    scene.build();
    stage.setView(OVERVIEW);
    sceneRef.current = scene;

    void loadTraining(handle.av, handle.viewer).then((nextTraining) => {
      nextTraining.setWorld({
        elements: [...ELEMENT_BY_ID.values()],
        rooms: ROOMS,
        storeyHeight: STOREY,
        levels: LEVELS,
        eyeHeight: EYE,
      });
      nextTraining.setRenderer(scene);
      nextTraining.setSection(CUTAWAY_Y);
      setTraining(nextTraining);
    });
  });

  const getTraining = useCallback(() => training, [training]);
  const subscribe = useCallback(
    (onChange: () => void) => training?.subscribe(onChange) ?? (() => {}),
    [training],
  );
  const snapshot = useCallback(() => training?.snapshot() ?? IDLE, [training]);
  const session = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    sceneRef.current?.drawTrail(session.trail);
  }, [session.trail]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => {
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
  }, []);

  useEffect(() => {
    const closeCompactPanes = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMissionPaneOpen(false);
      setActivityPaneOpen(false);
    };
    window.addEventListener("keydown", closeCompactPanes);
    return () => window.removeEventListener("keydown", closeCompactPanes);
  }, []);

  const pickRole = useCallback(
    (role: string) => {
      setRoleId(role);
      setNotice(undefined);
      if (role) setMissionPaneOpen(false);
      if (!training) return;
      if (!role) {
        training.clear();
        training.exitWalk();
        training.setSection(CUTAWAY_Y);
        setSectionOn(false);
        sceneRef.current?.clearTrail();
        getStage()?.setView(OVERVIEW);
        return;
      }
      setSectionOn(false);
      const mission = MISSIONS[role];
      if (mission) training.loadMission(mission);
    },
    [getStage, training],
  );

  useModelContextTools(
    useMemo(
      () =>
        trainingTools({
          getTraining,
          setRole: setRoleId,
          replay: async () => {
            if (!training) return;
            setReplaying(true);
            try {
              sceneRef.current?.drawTrail(training.snapshot().trail);
              await training.replay();
            } finally {
              setReplaying(false);
            }
          },
        }),
      [getTraining, training],
    ),
  );

  const pickContext = useCallback(() => ({
    level: session.level,
    room: session.room,
    targetIds: [
      ...(session.step?.validSelections ?? []),
      ...(session.step?.nearMisses?.map((item) => item.id) ?? []),
    ],
  }), [session.level, session.room, session.step]);

  const answerAt = useCallback(
    (clientX: number, clientY: number) => {
      const element = sceneRef.current?.pick(clientX, clientY, {
        ...pickContext(),
        tolerancePx: window.matchMedia("(pointer: coarse)").matches ? 24 : 18,
      });
      if (!element || !training) {
        setNotice({ message: "No selectable building component here.", tone: "neutral" });
        return;
      }
      const current = training.snapshot();
      if (current.status !== "running") {
        void training.applyViewerState({ highlight: [{ ids: [element.id], tone: "trace" }] });
        setNotice({ message: `${element.name} · ${element.system}`, tone: "neutral" });
        return;
      }
      if (current.step?.mode === "reach") {
        setNotice({ message: "Navigation step: walk to the destination. Selecting cannot complete it.", tone: "near" });
        return;
      }
      const verdict = training.submitSelection(element.id);
      setNotice({
        message: verdict.message,
        tone: verdict.kind === "correct" ? "good" : verdict.kind === "near" ? "near" : "bad",
      });
    },
    [pickContext, training],
  );

  const press = useRef<{
    pointerId: number;
    x: number;
    y: number;
    t: number;
    maxDistance: number;
  } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if ((event.target as Element).closest("[data-viewer-marker]")) return;
    press.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
      maxDistance: 0,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const start = press.current;
    if (start?.pointerId === event.pointerId) {
      start.maxDistance = Math.max(
        start.maxDistance,
        Math.hypot(event.clientX - start.x, event.clientY - start.y),
      );
    }
    if (event.buttons !== 0 || hoverFrame.current !== null) return;
    const { clientX, clientY } = event;
    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = null;
      const element = sceneRef.current?.pick(clientX, clientY, {
        ...pickContext(),
        tolerancePx: 12,
      });
      const rect = viewerRef.current?.getBoundingClientRect();
      setHover(element && rect
        ? {
            id: element.id,
            name: element.name,
            system: element.system,
            x: clientX - rect.left,
            y: clientY - rect.top,
          }
        : undefined);
    });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const start = press.current;
    press.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    if (start.maxDistance > (event.pointerType === "touch" ? 14 : 9)) return;
    if (performance.now() - start.t > 700) return;
    answerAt(event.clientX, event.clientY);
  };

  const onPointerCancel = () => {
    press.current = null;
  };

  const markers = useMemo<Marker[]>(() => {
    const ids = new Set<string>();
    for (const hint of session.revealed) for (const id of hint.reveals ?? []) ids.add(id);
    const last = [...session.decisions].reverse().find((decision) => decision.element && decision.verdict);
    if (last?.element) ids.add(last.element);
    return [...ids].flatMap((id) => {
      const element = ELEMENT_BY_ID.get(id);
      if (!element) return [];
      const verdict = last?.element === id ? last.verdict?.kind : undefined;
      return [{
        id,
        point: element.position as [number, number, number],
        tone: verdict === "correct" ? "cool" : verdict === "near" ? "warm" : verdict ? "alert" : "neutral",
        onSelect: session.step?.mode === "select"
          ? () => {
              if (!training) return;
              const result = training.submitSelection(id);
              setNotice({
                message: result.message,
                tone: result.kind === "correct" ? "good" : result.kind === "near" ? "near" : "bad",
              });
            }
          : undefined,
        children: <b>{element.name}</b>,
      } satisfies Marker];
    });
  }, [session.revealed, session.decisions, session.step?.mode, training]);

  const roomSigns = useMemo<Marker[]>(() => {
    if (!session.mission || session.level !== 1) return [];
    return [
      ["sign-ahu", [7, 6.35, 13.62], "AHU"],
      ["sign-214", [20, 6.35, 13.62], "214"],
      ["sign-215", [32, 6.35, 13.62], "215"],
      ["sign-218", [43, 6.35, 13.62], "218"],
    ].map(([id, point, label]) => ({
      id: String(id),
      point: point as [number, number, number],
      children: <span className="font-mono font-bold tracking-[0.08em]">{String(label)}</span>,
    }));
  }, [session.level, session.mission]);

  const walking = session.status === "running" && !!session.position;
  const roleLabel = ROLES.find((role) => role.id === roleId)?.label;
  const locationLabel = session.room
    ? ROOMS.find((room) => room.id === session.room)?.name ?? session.room
    : "outside";

  const toggleSection = () => {
    const next = !sectionOn;
    setSectionOn(next);
    training?.openCeiling(next);
  };

  return (
    <div className="app-shell">
      <header className="flex items-center gap-5 border-b border-border bg-background px-5">
        <div className="workspace-brand min-w-0">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">Drill Day</div>
          <div className="workspace-tagline mt-0.5 text-[11px] text-muted-foreground">AI-guided training in a live building model</div>
        </div>
        <div className="hidden items-center gap-4 text-[11px] text-muted-foreground lg:flex">
          <HeaderMeta>Autodesk Scene API</HeaderMeta>
          <HeaderMeta>WebMCP · 13 site tools</HeaderMeta>
          <HeaderMeta>Open source · MIT</HeaderMeta>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Mission"
            aria-controls="mission-panel"
            aria-expanded={missionPaneOpen}
            onClick={() => {
              setMissionPaneOpen((open) => !open);
              setActivityPaneOpen(false);
            }}
            className="workspace-pane-trigger workspace-mission-trigger"
          >
            <PanelLeft className="size-3.5" aria-hidden="true" /> <span className="workspace-trigger-label">Mission</span>
          </button>
          <button
            type="button"
            aria-label="Agent activity"
            aria-controls="agent-console"
            aria-expanded={activityPaneOpen}
            onClick={() => {
              setActivityPaneOpen((open) => !open);
              setMissionPaneOpen(false);
            }}
            className="workspace-pane-trigger workspace-activity-trigger"
          >
            <span className="workspace-live-dot size-1.5 rounded-full bg-success" aria-hidden="true" />
            <Activity className="size-3.5" aria-hidden="true" /> <span className="workspace-trigger-label">Activity</span>
          </button>
          <Link
            href="https://github.com/mrestrepoj10/drill-day"
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
            className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <GitFork className="size-3.5" aria-hidden="true" /> <span className="workspace-source-label">Source</span>
          </Link>
        </div>
      </header>

      <main className="workspace-grid">
        <TrainingPanel
          session={session}
          onPickRole={pickRole}
          onHint={() => training?.nextHint()}
          onSection={toggleSection}
          sectionOn={sectionOn}
          replaying={replaying}
          compactOpen={missionPaneOpen}
          onReplay={async () => {
            if (!training) return;
            setReplaying(true);
            try {
              await training.replay();
            } finally {
              setReplaying(false);
            }
          }}
        />

        <section
          ref={viewerRef}
          aria-label="Interactive building training viewer"
          className="workspace-viewer viewer-surface relative min-h-0 touch-none overflow-hidden bg-[#0b1114]"
          onPointerDownCapture={onPointerDown}
          onPointerMoveCapture={onPointerMove}
          onPointerUpCapture={onPointerUp}
          onPointerCancelCapture={onPointerCancel}
          onPointerLeave={() => setHover(undefined)}
        >
          <div ref={containerRef} className="absolute inset-0" />
          <StageStatus status={status} error={error} />
          <ViewerMarkers getStage={getStage} markers={[...roomSigns, ...markers]} />

          {walking ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden="true">
              <div className="size-4 rounded-full border border-foreground/65" />
              <div className="absolute size-1 rounded-full bg-foreground/90" />
            </div>
          ) : null}

          {hover ? (
            <div
              className="pointer-events-none absolute z-30 max-w-56 translate-x-3 translate-y-3 rounded-md border border-border bg-background/95 px-2.5 py-2"
              style={{ left: hover.x, top: hover.y }}
            >
              <div className="text-[11px] font-semibold">{hover.name}</div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-cyan">{hover.system} · {hover.id}</div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3">
            <div className="rounded-md border border-border bg-background/90 px-3 py-2 text-[11px]">
              <span className="font-semibold">{roleLabel ?? "Choose a scenario"}</span>
              <span className="text-muted-foreground"> · L{session.level} · {locationLabel}</span>
            </div>
            <div className="pointer-events-auto flex gap-1 rounded-md border border-border bg-background/90 p-1">
              {Array.from({ length: LEVELS }, (_, level) => {
                const locked = session.status === "running" && session.step?.mode === "reach";
                return (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={session.level === level}
                    disabled={locked}
                    title={locked ? "Level shortcuts are disabled during a navigation objective" : `View level ${level}`}
                    onClick={() => training?.goToLevel(level)}
                    className={`rounded-md px-2.5 py-1.5 font-mono text-[10px] transition disabled:cursor-not-allowed disabled:opacity-35 ${
                      session.level === level ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    L{level}
                  </button>
                );
              })}
            </div>
          </div>

          {notice ? (
            <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-4">
              <div className={`max-w-lg rounded-md border px-3 py-2 text-center text-[12px] font-medium ${
                notice.tone === "good"
                  ? "border-success/40 bg-[#10251b]/95 text-success"
                  : notice.tone === "near"
                    ? "border-amber/40 bg-[#2a2113]/95 text-amber"
                    : notice.tone === "bad"
                      ? "border-destructive/40 bg-[#2b1617]/95 text-destructive"
                      : "border-border bg-background/95 text-foreground"
              }`}>
                {notice.message}
              </div>
            </div>
          ) : null}

          {!notice && replaying ? (
            <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-4">
              <div className="rounded-md border border-cyan/30 bg-background/95 px-4 py-2 text-[11px] text-cyan">
                Replaying the route and every decision in sequence…
              </div>
            </div>
          ) : !notice && session.status === "running" ? (
            <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-4">
              <div
                aria-label="Viewer controls"
                className="flex max-w-full flex-wrap items-center justify-center gap-3 rounded-md border border-border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground"
              >
                <span className="flex items-center gap-1"><span className="keycap">W</span><span className="keycap">A</span><span className="keycap">S</span><span className="keycap">D</span> walk</span>
                <span>Drag to look</span>
                {session.step?.mode === "reach" ? (
                  <span>Reach the target room</span>
                ) : (
                  <span className="flex items-center gap-1"><MousePointer2 className="size-3" aria-hidden="true" /> click a component to answer</span>
                )}
              </div>
            </div>
          ) : null}
        </section>

        <AgentConsole
          namespace="training_"
          drills={DRILLS}
          session={session}
          compactOpen={activityPaneOpen}
        />
      </main>
    </div>
  );
}

function HeaderMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-l border-border pl-4 first:border-l-0 first:pl-0">
      {children}
    </span>
  );
}
