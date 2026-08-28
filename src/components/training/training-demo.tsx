"use client";

import { MousePointer2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Stage } from "@layer0/scene-render";
import { pushAmbientContext, useModelContext, useModelContextTools } from "@layer0/webmcp";
import {
  learningCueRooms,
  loadTraining,
  type SelectionResult,
  type TrainingSession,
  type ViewerTraining,
} from "@layer0/viewer-training";
import { ELEMENT_BY_ID, EYE, LEVELS, ROOMS, STOREY } from "@/lib/training/facility";
import { MISSIONS, ROLES } from "@/lib/training/missions";
import { trainingTools } from "@/lib/training/tools";
import { TrainingScene } from "@/components/training/scene";
import { TrainingPanel } from "@/components/training/panel";
import { AgentConsole, type Drill } from "@/components/agent-console";
import { StageStatus, useStage } from "@/components/use-stage";
import { ViewerMarkers, type Marker } from "@/components/viewer-markers";
import { WorkspaceHeader } from "@/components/training/workspace-header";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const CUTAWAY_Y = LEVELS * STOREY - 0.6;
const OVERVIEW = Stage.frame([24, 3, 16], 82, -1.05, 0.66);

const IDLE: TrainingSession = {
  version: 0,
  stepIndex: 0,
  status: "idle",
  attempts: 0,
  hintsUsed: 0,
  learningCuesOn: true,
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

const VIEWER_CHROME_SELECTOR = [
  ".homeViewWrapper",
  ".viewcubeWrapper",
  ".viewcube",
  ".adsk-toolbar",
  ".adsk-button",
  ".adsk-control-group",
].join(",");

function isViewerChrome(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(VIEWER_CHROME_SELECTOR);
}

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
  const [missionPaneOpen, setMissionPaneOpen] = useState(true);
  const [activityPaneOpen, setActivityPaneOpen] = useState(false);

  const modelContext = useModelContext();
  const { calls } = modelContext;

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

  // The console is an overlay at every width, closed by default. The first
  // agent-origin tool call opens it once, so the audit trail arrives as a
  // moment; after that the navbar badge carries the signal.
  const agentCallCount = useMemo(
    () => calls.reduce((count, call) => count + (call.origin === "agent" ? 1 : 0), 0),
    [calls],
  );
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || agentCallCount === 0) return;
    autoOpened.current = true;
    setActivityPaneOpen(true);
    setMissionPaneOpen(false);
  }, [agentCallCount]);

  // Everything visible while the pane is open counts as seen; the handlers
  // that open or close the pane stamp the count, so the closed-state badge
  // only carries events that arrived since.
  const eventCount = calls.length + session.decisions.length + session.coaching.length;
  const [seenCount, setSeenCount] = useState(0);
  const unseen = activityPaneOpen ? 0 : Math.max(0, eventCount - seenCount);

  const toggleActivityPane = () => {
    setSeenCount(eventCount);
    setActivityPaneOpen((open) => !open);
    setMissionPaneOpen(false);
  };

  const closeActivityPane = () => {
    setSeenCount(eventCount);
    setActivityPaneOpen(false);
  };

  // Learner events flow *to* the agent too, where the host supports ambient
  // context, so ChatGPT can react to a room entry or a selection unprompted.
  // On hosts without provideContext this is a silent no-op.
  const pushedDecisions = useRef(0);
  useEffect(() => {
    const fresh = session.decisions.slice(pushedDecisions.current);
    pushedDecisions.current = session.decisions.length;
    for (const decision of fresh) {
      const room = decision.room
        ? ROOMS.find((item) => item.id === decision.room)?.name ?? decision.room
        : undefined;
      const element = decision.element ? ELEMENT_BY_ID.get(decision.element)?.name : undefined;
      const line = decision.kind === "enter" && room
        ? `The learner just entered ${room}.`
        : decision.kind === "arrive" && room
          ? `The learner reached ${room}.`
          : (decision.kind === "select" || decision.kind === "inspect") && element
            ? `The learner selected ${element}${decision.verdict ? ` — ${decision.verdict.kind}` : ""}.`
            : decision.kind === "deselect" && element
              ? `The learner cleared ${element} from the selection.`
              : decision.kind === "cue"
                ? `The learner turned learning cues ${decision.enabled ? "on" : "off"}.`
                : undefined;
      if (line) pushAmbientContext(`Drill Day update: ${line} Call training_get_session for detail.`);
    }
  }, [session.decisions]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => {
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
  }, []);

  // Latest-value ref so the Escape listener registers once instead of
  // re-attaching every time an event lands in the feed.
  const eventCountRef = useRef(eventCount);
  useEffect(() => {
    eventCountRef.current = eventCount;
  });

  useEffect(() => {
    const closeCompactPanes = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSeenCount(eventCountRef.current);
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

  const showSelectionResult = useCallback((result: SelectionResult) => {
    const verdict = result.verdict;
    setNotice({
      message: result.message,
      tone: result.action === "cleared"
        ? "neutral"
        : verdict?.kind === "correct"
          ? "good"
          : verdict?.kind === "near" || result.action === "blocked"
            ? "near"
            : verdict
              ? "bad"
              : "neutral",
    });
  }, []);

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
        showSelectionResult(training.toggleSelection(element.id));
        return;
      }
      if (current.step?.mode === "reach") {
        setNotice({ message: "Navigation step: walk to the destination. Selecting cannot complete it.", tone: "near" });
        return;
      }
      showSelectionResult(training.toggleSelection(element.id));
    },
    [pickContext, showSelectionResult, training],
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
    if (isViewerChrome(event.target)) {
      press.current = null;
      return;
    }
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
    if (isViewerChrome(event.target)) {
      setHover(undefined);
      return;
    }
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
    if (isViewerChrome(event.target)) {
      press.current = null;
      return;
    }
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
    if (session.selection?.element) ids.add(session.selection.element);
    return [...ids].flatMap((id) => {
      const element = ELEMENT_BY_ID.get(id);
      if (!element) return [];
      const verdict = session.selection?.element === id ? session.selection.verdict?.kind : undefined;
      return [{
        id,
        point: element.position as [number, number, number],
        tone: verdict === "correct" ? "cool" : verdict === "near" ? "warm" : verdict ? "alert" : "neutral",
        onSelect: session.status !== "running" || session.step?.mode === "select"
          ? () => {
              if (!training) return;
              showSelectionResult(training.toggleSelection(id));
            }
          : undefined,
        children: <b>{element.name}</b>,
      } satisfies Marker];
    });
  }, [session.revealed, session.selection, session.status, session.step?.mode, showSelectionResult, training]);

  const roomSigns = useMemo<Marker[]>(() => {
    if (!session.mission || session.level !== 1) return [];
    const cueRooms = session.learningCuesOn
      ? new Set(learningCueRooms(session.step))
      : new Set<string>();
    return [
      ["sign-ahu", [7, 6.35, 13.62], "AHU", "AHU-L1"],
      ["sign-214", [20, 6.35, 13.62], "214", "ROOM-214"],
      ["sign-215", [32, 6.35, 13.62], "215", "ROOM-215"],
      ["sign-218", [43, 6.35, 13.62], "218", "ROOM-218"],
    ].map(([id, point, label, roomId]) => ({
      id: String(id),
      point: point as [number, number, number],
      tone: cueRooms.has(String(roomId)) ? "cool" : "neutral",
      children: <span className="font-mono font-semibold">{String(label)}</span>,
    }));
  }, [session.learningCuesOn, session.level, session.mission, session.step]);

  const walking = session.status === "running" && !!session.position;
  const activeRole = session.mission?.role ?? roleId;
  const roleLabel = ROLES.find((role) => role.id === activeRole)?.label || activeRole || undefined;
  const locationLabel = session.room
    ? ROOMS.find((room) => room.id === session.room)?.name ?? session.room
    : "outside";
  const destinationLabel = session.step?.validDestination?.room
    ? ROOMS.find((room) => room.id === session.step?.validDestination?.room)?.name
    : undefined;
  const challengeIndex = session.mission?.author === "built-in"
    ? ROLES.findIndex((role) => role.id === session.mission?.role)
    : -1;
  const challengeNumber = challengeIndex >= 0
    ? String(challengeIndex + 1).padStart(2, "0")
    : undefined;
  const challengeName = session.mission?.author === "agent"
    ? "Custom challenge"
    : challengeNumber
      ? `Challenge ${challengeNumber}`
      : "WebMCP challenge";
  const challengeContext = roleLabel ? `${challengeName} · ${roleLabel}` : challengeName;
  const challengeLabel = challengeNumber
    ? `${challengeName} of ${String(ROLES.length).padStart(2, "0")}`
    : challengeName;

  // The movement tutorial has done its job once the learner has actually
  // walked; from then on the bar carries only the objective.
  const hasWalked = session.status === "running" && session.trail.length > 3;

  const toggleSection = () => {
    const next = !sectionOn;
    setSectionOn(next);
    training?.openCeiling(next);
  };

  const returnToOverview = useCallback(() => {
    training?.exitWalk();
    training?.setSection(CUTAWAY_Y);
    sceneRef.current?.setCeiling(false);
    setSectionOn(false);
    void getStage()?.flyTo(OVERVIEW, 520);
  }, [getStage, training]);

  const onViewerClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".homeViewWrapper")) return;
    event.preventDefault();
    event.stopPropagation();
    returnToOverview();
  }, [returnToOverview]);

  return (
    <div className="app-shell">
      <WorkspaceHeader
        context={challengeContext}
        missionPaneOpen={missionPaneOpen}
        activityPaneOpen={activityPaneOpen}
        unseenActivity={unseen}
        onToggleMission={() => {
          setMissionPaneOpen((open) => !open);
          setActivityPaneOpen(false);
        }}
        onToggleActivity={toggleActivityPane}
      />

      <main id="training-workspace" className="workspace-grid">
        <TrainingPanel
          session={session}
          onPickRole={pickRole}
          onHint={() => training?.nextHint()}
          onSection={toggleSection}
          sectionOn={sectionOn}
          replaying={replaying}
          compactOpen={missionPaneOpen}
          challengeLabel={challengeLabel}
          roleLabel={roleLabel ?? "Custom role"}
          onLearningCues={() => training?.toggleLearningCues()}
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
          className="workspace-viewer viewer-surface relative min-h-0 touch-none overflow-hidden bg-viewer-surface"
          onPointerDownCapture={onPointerDown}
          onPointerMoveCapture={onPointerMove}
          onPointerUpCapture={onPointerUp}
          onPointerCancelCapture={onPointerCancel}
          onPointerLeave={() => setHover(undefined)}
          onClickCapture={onViewerClickCapture}
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
              <div className="text-[13px] font-semibold leading-[1.4]">{hover.name}</div>
              <div className="mt-0.5 font-mono text-[11px] leading-[1.4] text-text-tertiary">{hover.system} · {hover.id}</div>
            </div>
          ) : null}

          {notice ? (
            <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-[4.75rem] z-30 flex justify-center px-4">
              <div className={`surface-pop max-w-lg rounded-md border px-3 py-2 text-center text-[12px] font-medium tone-${notice.tone}`}>
                {notice.message}
              </div>
            </div>
          ) : null}

          {!notice && replaying ? (
            <div className="pointer-events-none absolute inset-x-0 top-[4.75rem] z-20 flex justify-center px-4">
              <div className="surface-pop rounded-md border border-interactive/30 bg-background/95 px-4 py-2 text-[12px] text-interactive">
                Replaying the route and every decision in sequence…
              </div>
            </div>
          ) : null}

          {/* Persistent scene context belongs above the model, away from LMV's toolbar. */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
            <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-background/90 py-1.5 pl-3 pr-1.5 text-[12px]">
              <span className="leading-[1.4]">
                <span className="font-semibold">{roleLabel ?? "Choose a scenario"}</span>
                <span className="text-muted-foreground"> · L{session.level} · {locationLabel}</span>
              </span>

              {session.status === "running" && !hasWalked ? (
                <span className="flex items-center gap-3 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <KbdGroup>
                      <Kbd>W</Kbd>
                      <Kbd>A</Kbd>
                      <Kbd>S</Kbd>
                      <Kbd>D</Kbd>
                    </KbdGroup>
                    walk
                  </span>
                  <span>Drag to look</span>
                </span>
              ) : null}

              {session.status === "running" ? (
                <span className="workspace-viewer-objective flex items-center gap-1 text-muted-foreground">
                  {session.step?.mode === "reach" ? (
                    <>Reach {destinationLabel ?? "the target room"}</>
                  ) : session.selection ? (
                    <><MousePointer2 className="size-3" aria-hidden="true" /> Click the selected component again to clear</>
                  ) : (
                    <>
                      <MousePointer2 className="size-3" aria-hidden="true" /> Click a component to answer
                    </>
                  )}
                </span>
              ) : null}

              <span className="flex gap-0.5" role="group" aria-label="Levels">
                {Array.from({ length: LEVELS }, (_, level) => {
                  const locked = session.status === "running" && session.step?.mode === "reach";
                  const active = session.level === level;
                  return (
                    <Tooltip key={level}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant={active ? "default" : "ghost"}
                          size="xs"
                          aria-pressed={active}
                          disabled={locked}
                          onClick={() => training?.goToLevel(level)}
                          className="font-mono text-[11px]"
                        >
                          L{level}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" sideOffset={8}>
                        {locked ? "Level shortcuts are disabled during a navigation objective" : `View level ${level}`}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </span>
            </div>
          </div>
        </section>

        <AgentConsole
          namespace="training_"
          drills={DRILLS}
          session={session}
          context={modelContext}
          compactOpen={activityPaneOpen}
          onClose={closeActivityPane}
        />
      </main>
    </div>
  );
}
