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
import { Stage, type CameraView } from "@layer0/scene-render";
import { pushAmbientContext, toolJournal, useModelContext, useModelContextTools } from "@layer0/webmcp";
import {
  learningCueRooms,
  loadTraining,
  type SelectionResult,
  type TrainingSession,
  type ViewerTraining,
} from "@layer0/viewer-training";
import { ELEMENT_BY_ID, EYE, LEVELS, ROOMS, STOREY } from "@/lib/training/facility";
import { MISSIONS, ROLES } from "@/lib/training/missions";
import { frameElement, trainingTools } from "@/lib/training/tools";
import { TrainingScene } from "@/components/training/scene";
import { missionStages, TrainingPanel } from "@/components/training/panel";
import { ViewerHud } from "@/components/training/viewer-hud";
import { AgentConsole, type Drill } from "@/components/agent-console";
import { StageStatus, useStage } from "@/components/use-stage";
import { ViewerMarkers, type Marker } from "@/components/viewer-markers";
import { WalkControls, type LookMode } from "@/components/training/walk-controls";
import { WorkspaceHeader } from "@/components/training/workspace-header";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const CUTAWAY_Y = LEVELS * STOREY - 0.6;
const OVERVIEW = Stage.frame([24, 3, 16], 82, -1.05, 0.66);

/**
 * How long the agent has to stay quiet before a tour counts as over.
 *
 * Not a duration for the tour — a wait for the agent, which is a different
 * thing: it thinks between calls, and a fixed clock cuts a briefing off
 * mid-sentence. A real run took two minutes over a dozen calls, so the gaps
 * are seconds to tens of seconds and they are not knowable in advance.
 *
 * So the wait learns the pace it is waiting on: whatever the longest gap this
 * tour has shown, times a margin, floored so a brisk opening does not set an
 * impatient window and capped so a stall does not hold the camera forever.
 */
/**
 * The calls that put someone in the building.
 *
 * A tour is "an agent is showing me around", and these are the tools that can
 * make that true: they move the camera, light part of the model, or read a
 * piece of it out. Everything else an agent can call — reading the session,
 * saying a line, composing a mission — leaves the view exactly as it was.
 */
const TOURING_TOOLS = new Set([
  "training_annotate",
  "training_cut_section",
  "training_inspect_element",
  "training_list_elements",
  "training_locate_element",
  "training_set_view",
  "training_trace_system",
]);

const TOUR_QUIET_MIN_MS = 20_000;
const TOUR_QUIET_MAX_MS = 90_000;
const TOUR_QUIET_MARGIN = 3;

/**
 * Whether a tool call is running at this instant.
 *
 * The journal writes an entry the moment a call starts and stamps `durationMs`
 * when it settles, so an unstamped entry is a call still in flight. That is
 * how the page tells "something walked us in here" from "the learner pressed
 * look around": both put the camera on foot, and only one of them happens
 * inside a tool. Origin is deliberately not part of it — a rehearsal drill is
 * page-originated and is still the model being toured rather than walked.
 *
 * Read off the journal rather than React state, because the camera moves
 * before the render that would carry it.
 */
function midToolCall(): boolean {
  const calls = toolJournal.list();
  const last = calls[calls.length - 1];
  return !!last && last.durationMs === undefined;
}

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
  annotations: [],
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
      { tool: "training_attempt", input: { id: "CHW-VLV-L1" }, pause: 500 },
      { tool: "training_inspect_element", input: { id: "CHW-DROP-214" }, pause: 500 },
      { tool: "training_give_hint" },
    ],
  },
  {
    label: "Agent takes the verdict",
    hint: "The agent answers the step itself and is marked by the same rules the learner is.",
    // Deliberately does not load a mission: it answers whatever step is open,
    // so it lands inside the flagship drill rather than interrupting it.
    steps: [
      { tool: "training_attempt", input: { id: "CHW-FCU-214" }, pause: 1100 },
      {
        tool: "training_annotate",
        input: {
          id: "CHW-FCU-214",
          note: "I picked this and was marked down: the coil is wet, but water runs downhill. Look above it.",
        },
        pause: 900,
      },
      { tool: "training_get_session" },
    ],
  },
  {
    label: "Let it work alone",
    hint: "One instruction, eight calls: it browses, traces the system, and pins its own notes. Best from the start screen.",
    // The long autonomous run. Nothing here names a mission answer — it is a
    // pre-drill briefing on how the building is fed, which is the reasoning the
    // flagship goes on to test rather than a shortcut past it.
    steps: [
      { tool: "training_list_elements", input: { system: "chilled water" }, pause: 800 },
      { tool: "training_trace_system", input: { id: "CHW-CRAC-217" }, pause: 800 },
      { tool: "training_inspect_element", input: { id: "CHW-VLV-MAIN" }, pause: 650 },
      {
        tool: "training_annotate",
        input: {
          id: "CHW-VLV-MAIN",
          note: "Closes chilled water for the whole building, server room included. Last resort, never the first move.",
          show: true,
        },
        pause: 800,
      },
      { tool: "training_inspect_element", input: { id: "CHW-CRAC-217" }, pause: 650 },
      {
        tool: "training_annotate",
        input: {
          id: "CHW-CRAC-217",
          note: "Server room cooling, fed from the same chilled water as the rest of the floor. This is the thing you are protecting.",
          show: true,
        },
        pause: 800,
      },
      {
        tool: "training_annotate",
        input: {
          id: "CHW-RSR-01",
          note: "Every service upstairs comes up this riser, so this is where one floor can be isolated on its own.",
          show: true,
        },
        pause: 800,
      },
      {
        tool: "training_say",
        input: {
          text: "Briefing done. One chiller, one riser, and a server room that cannot lose cooling — three notes pinned in the scene where the plant is.",
        },
      },
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

/** Chrome drawn over the model: the viewer's own gestures must not claim it. */
const VIEWER_UI = "[data-viewer-marker],[data-viewer-ui]";

type PickNotice = {
  message: string;
  tone: "neutral" | "good" | "near" | "bad";
  /** Turns the notice into an invitation rather than a verdict. */
  action?: { label: string; run: () => void };
  /**
   * Where on the canvas it belongs.
   *
   * A verdict is about the model, so it arrives over the middle of it. A
   * notice about the activity feed is about a control in the top bar, and
   * centred over the viewer it is a sentence pointing at nothing — at panel
   * widths the middle of the canvas is most of a screen away from the toggle
   * it is asking you to press.
   */
  anchor?: "centre" | "activity";
};
type HoverLabel = {
  id: string;
  name: string;
  system: string;
  x: number;
  y: number;
  /** Named by the crosshair rather than by the pointer. */
  fromCentre: boolean;
};


export function TrainingDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TrainingScene | null>(null);
  const hoverFrame = useRef<number | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const [training, setTraining] = useState<ViewerTraining | null>(null);
  const [roleId, setRoleId] = useState("");
  // Read back from the runtime rather than held here: the agent lifts the
  // tiles too, when a note it is pinning sits above them, and a toggle that
  // disagreed with the ceiling would cost the learner a dead press.
  const [sectionOn, setSectionOn] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [notice, setNotice] = useState<PickNotice>();
  const [hover, setHover] = useState<HoverLabel>();
  const [looking, setLooking] = useState(false);
  // Where the lock cannot be had, looking is a drag and the UI has to say so
  // rather than keep inviting a click that will never take the camera.
  const [lookMode, setLookMode] = useState<LookMode>("click");
  // On foot is a property of the camera, not of the mission: an agent can walk
  // someone through the building with no drill loaded at all, and the controls
  // have to be there when it does.
  const [onFoot, setOnFoot] = useState(false);
  const [missionPaneOpen, setMissionPaneOpen] = useState(true);
  // Where the camera stood when the agent set off, and where it goes back to
  // when the agent goes quiet. Null whenever no tour is running.
  const [tourFrom, setTourFrom] = useState<CameraView | null>(null);
  // The last pose the camera held while not on foot, kept so the tour has
  // somewhere to return to that the learner actually chose.
  const restingView = useRef<CameraView | null>(null);
  const [activityPaneOpen, setActivityPaneOpen] = useState(false);

  const modelContext = useModelContext();
  const { calls, tools } = modelContext;

  const { getStage, status, error } = useStage(containerRef, (stage, handle) => {
    const scene = new TrainingScene(stage);
    scene.build();
    stage.setView(OVERVIEW);
    sceneRef.current = scene;

    void loadTraining(handle).then((nextTraining) => {
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

  /** True once this session has ever held the pointer. */
  const everLooked = useRef(false);
  /** A request is outstanding, so the next refusal is an answer to it. */
  const askedLook = useRef(false);
  /** When the lock was last given up, so Escape is not spent twice. */
  const releasedAt = useRef(0);

  useEffect(() => {
    const stage = getStage();
    if (!stage) return;
    return stage.onLook((locked: boolean) => {
      setLooking(locked);
      if (locked) {
        everLooked.current = true;
        askedLook.current = false;
        setLookMode("click");
        return;
      }
      // A refusal after we have already held the lock once is the cooldown the
      // spec imposes right after an Escape exit — transient, and clicking
      // again works. A refusal before we have ever held it is the host saying
      // no for good: an iframe without `allow-pointer-lock`, or no support.
      if (askedLook.current && !everLooked.current) setLookMode("drag");
      else releasedAt.current = performance.now();
      askedLook.current = false;
    });
  }, [getStage, status]);

  useEffect(() => {
    if (!training) return;
    return training.onCeiling(() => setSectionOn(training.ceilingOpen));
  }, [training]);

  const getTraining = useCallback(() => training, [training]);
  const subscribe = useCallback(
    (onChange: () => void) => training?.subscribe(onChange) ?? (() => {}),
    [training],
  );
  const snapshot = useCallback(() => training?.snapshot() ?? IDLE, [training]);
  const session = useSyncExternalStore(subscribe, snapshot, snapshot);
  const walking = onFoot || (session.status === "running" && !!session.position);

  // Nobody is left holding a cursor they cannot see. The moment the drill is
  // marked — or walking ends for any other reason — the pointer goes back on
  // its own, so the debrief, the sidebar and the browser's own tabs are
  // reachable without anyone having to work out that Escape was the way out.
  const complete = session.status === "complete";
  useEffect(() => {
    if (walking && !complete) return;
    getStage()?.releaseLook();
  }, [complete, getStage, walking]);

  // Machine-readable session breadcrumb for automated QA (agents driving the
  // page can read position/room without scraping pixels). Invisible to users.
  useEffect(() => {
    const p = session.position;
    document.documentElement.dataset.drill = JSON.stringify({
      room: session.room ?? null,
      level: session.level,
      position: p ? p.map((v) => Math.round(v * 10) / 10) : null,
      step: session.step?.id ?? null,
      status: session.status,
    });
  }, [session]);

  // The console is an overlay at every width and only ever opens because
  // someone asked. It used to throw itself open on the first agent call, which
  // is a heavy way to say "look over here" — a full-height drawer across the
  // model, unrequested, while the learner is trying to walk.
  //
  // A first-time visitor still has to find out the audit trail exists, so the
  // first agent call says so once, through the same transient surface a
  // verdict uses, and offers to open it. Three seconds, then gone; the navbar
  // badge carries the count from there.
  const agentCallCount = useMemo(
    () => calls.reduce((count, call) => count + (call.origin === "agent" ? 1 : 0), 0),
    [calls],
  );
  // The journal's own sequence number, which keeps counting past the entry
  // cap that holds `calls.length` still. Every call moves it, whoever made it.
  const lastCallId = calls.length ? calls[calls.length - 1].id : 0;
  // The pace of the agent driving this tour: when its last call landed, and
  // the longest it has gone between two of them.
  const pace = useRef({ at: 0, longest: 0 });
  // Read inside the end-of-tour timeout, which fires long after the render
  // that scheduled it.
  const annotationsRef = useRef(0);

  const sessionStatus = session.status;
  // The last call that actually reached the building and came back clean.
  const lastBuildingCallId = useMemo(() => {
    for (let i = calls.length - 1; i >= 0; i--) {
      const call = calls[i];
      if (!TOURING_TOOLS.has(call.name)) continue;
      if (call.durationMs === undefined || call.error) continue;
      return call.id;
    }
    return 0;
  }, [calls]);

  useEffect(() => {
    // A tour used to begin at the agent's first *step*, which is several calls
    // in: it reads the session, browses the catalogue and traces the system
    // before it has anything to pin. That left the page still for the best
    // part of a minute while the agent worked — the one moment it most needs
    // to look alive. It begins at the first call that touches the building
    // instead, so the panel steps aside and the plan comes up straight away.
    //
    // Only the calls that read or move the building count. Answering a
    // question about the session, saying a line, or composing a mission puts
    // nobody in a corridor, and neither does a call that failed validation —
    // none of them should clear the panel and then hold the camera for the
    // length of a briefing that never happened.
    if (!lastBuildingCallId || sessionStatus === "running") return;
    setTourFrom((from) => from ?? restingView.current ?? OVERVIEW);
    setMissionPaneOpen(false);
  }, [lastBuildingCallId, sessionStatus]);

  useEffect(() => {
    const stage = getStage();
    if (!stage) return;
    // Subscribe only: the stage boots in orbit, and every entry into or exit
    // from walk moves the camera, so the first callback carries the truth.
    return stage.onCamera(() => {
      const walking = stage.walking;
      setOnFoot(walking);
      if (!walking) {
        restingView.current = stage.currentView() ?? null;
        return;
      }
      // An agent putting the camera on foot with no drill loaded is giving a
      // tour. The panel steps aside for it — a tour is the model and the plan,
      // not the brief — and the pose it set off from is kept to come back to.
      if (sessionStatus === "running" || !midToolCall()) return;
      setTourFrom((from) => from ?? restingView.current ?? OVERVIEW);
      setMissionPaneOpen(false);
    });
  }, [getStage, status, sessionStatus]);

  useEffect(() => {
    annotationsRef.current = session.annotations.length;
  }, [session.annotations]);

  useEffect(() => {
    if (!tourFrom) {
      // Whatever ended the tour — the wait running out, or a drill taking it
      // over — the next one starts from scratch. A timestamp carried across
      // would read the whole interval between two tours as one thinking
      // pause, and open the next one on the 90-second cap.
      pace.current = { at: 0, longest: 0 };
      return;
    }
    // Waiting on the agent, not running a clock on the tour: every call it
    // makes re-runs this effect and starts the wait again, so a long briefing
    // is never cut off between two notes.
    const now = Date.now();
    if (pace.current.at) {
      pace.current.longest = Math.max(pace.current.longest, now - pace.current.at);
    }
    pace.current.at = now;
    const wait = Math.min(
      TOUR_QUIET_MAX_MS,
      Math.max(TOUR_QUIET_MIN_MS, pace.current.longest * TOUR_QUIET_MARGIN),
    );
    const timer = setTimeout(() => {
      training?.exitWalk();
      void getStage()?.flyTo(tourFrom, 900);
      // All the way back — but only as far as the panel when the briefing left
      // nothing to walk. At drawer widths the panel covers the plan, and the
      // plan is carrying the notes and the control that steps through them; a
      // briefing you cannot walk back is one you had to take in at the agent's
      // pace, once. The panel is a toggle away when they want it.
      if (!annotationsRef.current) setMissionPaneOpen(true);
      setTourFrom(null);
    }, wait);
    return () => clearTimeout(timer);
  }, [tourFrom, lastCallId, getStage, training]);

  // A drill starting mid-tour is the agent handing over, not finishing: the
  // mission owns the camera from here, so the tour ends where it stands.
  if (tourFrom && session.status === "running") setTourFrom(null);

  const [invited, setInvited] = useState(false);
  if (agentCallCount > 0 && !invited) {
    setInvited(true);
    setNotice({
      message: "ChatGPT is working in this page.",
      tone: "neutral",
      action: { label: "Watch it", run: () => openActivityPane() },
      anchor: "activity",
    });
  }

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

  const openActivityPane = () => {
    setSeenCount(eventCount);
    setActivityPaneOpen(true);
    setMissionPaneOpen(false);
  };

  // Learner events flow *to* the agent too, where the host supports ambient
  // context, so ChatGPT can react to a room entry or a selection unprompted.
  // On hosts without provideContext this is a silent no-op.
  const pushedDecisions = useRef(0);
  useEffect(() => {
    const fresh = session.decisions.slice(pushedDecisions.current);
    pushedDecisions.current = session.decisions.length;
    for (const decision of fresh) {
      // The agent does not need to be told what the agent just did.
      if (decision.by === "agent") continue;
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

  // The tool access panel tells the learner which half of the toolset is live.
  // This tells the agent the same thing, unprompted, as the step changes — so
  // it can plan around a refusal instead of discovering it.
  const stepId = session.step?.id;
  useEffect(() => {
    if (!stepId) return;
    const allowed = session.step?.allowedTools;
    pushAmbientContext(
      allowed
        ? `Drill Day: a new stage is open and it restricts your tools. Allowed here: ${allowed.join(", ")}. Anything else will be refused.`
        : "Drill Day: a new stage is open, with every site tool available.",
    );
    // Only the step identity should re-announce; the step object is stable per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepId]);

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
      // The browser is already using this Escape to hand the pointer back.
      // Closing the drawers on the same keystroke would be two things
      // happening for one press — and the keydown can arrive either side of
      // the unlock, so the moment the lock ended counts as still in use.
      if (document.pointerLockElement) return;
      if (performance.now() - releasedAt.current < 600) return;
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
    maxDistance: number;
  } | null>(null);

  /** Whether the camera was already ours when this press started. */
  const heldAtPress = useRef(false);

  const takeLook = useCallback(() => {
    askedLook.current = true;
    getStage()?.requestLook();
  }, [getStage]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if ((event.target as Element).closest(VIEWER_UI)) return;
    // Ask on the press, so the release knows whether this click bought the
    // camera or was made with it.
    heldAtPress.current = getStage()?.looking ?? false;
    if (event.pointerType !== "mouse") {
      // A finger has no pointer to lock. Looking is a drag here, and the
      // invitation has to stop asking for a click that cannot deliver one.
      setLookMode("drag");
    } else if (walking && lookMode === "click" && !heldAtPress.current) {
      takeLook();
    }
    press.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
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
    // Locked, the pointer has no position to hover with; the camera names what
    // it is aimed at instead, in the rAF loop below.
    if (looking || event.buttons !== 0 || hoverFrame.current !== null) return;
    const { clientX, clientY } = event;
    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = null;
      const element = sceneRef.current?.pick(clientX, clientY, {
        ...pickContext(),
        tolerancePx: 12,
      });
      const rect = viewerRef.current?.getBoundingClientRect();
      hoverIdRef.current = element?.id ?? null;
      setHover(element && rect
        ? {
            id: element.id,
            name: element.name,
            system: element.system,
            x: clientX - rect.left,
            y: clientY - rect.top,
            fromCentre: false,
          }
        : undefined);
    });
  };

  /** Client coords of the crosshair — the aim point while the pointer is ours. */
  const crosshair = useCallback((): [number, number] | null => {
    const rect = viewerRef.current?.getBoundingClientRect();
    return rect ? [rect.left + rect.width / 2, rect.top + rect.height / 2] : null;
  }, []);

  const onPointerUp = (event: React.PointerEvent) => {
    // Controls drawn over the model are chrome, not scene. Without this the
    // section's capture handlers run first and a press on one of them takes
    // the camera or answers the step, and can unmount the control before its
    // own click ever fires.
    if ((event.target as Element).closest(VIEWER_UI)) {
      press.current = null;
      return;
    }
    const start = press.current;
    press.current = null;
    const held = getStage()?.looking ?? false;

    if (held) {
      // The click that took the camera bought that and nothing else; a click
      // made while already holding it is an answer.
      if (!heldAtPress.current) return;
      // A locked pointer has no position, so a click cannot be a drag and
      // there is nothing to disambiguate — the whole reason for the lock. The
      // crosshair is the aim point, and no gate stands in front of it.
      const centre = crosshair();
      if (centre) answerAt(centre[0], centre[1]);
      return;
    }

    // No lock — refused, unsupported, on a touch screen, or inside the
    // cooldown that follows an Escape exit. A click still has to answer: a
    // click that only ever asks for a camera it cannot have is a dead click.
    if (!start || start.pointerId !== event.pointerId) return;
    // Looking is a drag here, so a press that travelled was a look. There is
    // no duration test: a long, still press is a real click, and timing it out
    // was throwing away deliberate ones while someone lined up on a valve.
    if (start.maxDistance > (event.pointerType === "touch" ? 16 : 12)) return;
    answerAt(event.clientX, event.clientY);
  };

  const onPointerCancel = () => {
    press.current = null;
  };

  const markers = useMemo<Marker[]>(() => {
    const ids = new Set<string>();
    for (const hint of session.revealed) for (const id of hint.reveals ?? []) ids.add(id);
    if (session.selection?.element) ids.add(session.selection.element);
    // A pinned note puts the agent's sentence on the thing it is about, rather
    // than in a panel the learner has to look away from.
    // Numbered to match the floor plan's diamonds and the agent's own
    // `pinnedNotes`, so all three are talking about the same note.
    const notes = new Map(
      session.annotations.map((note, index) => [note.id, { text: note.note, ordinal: index + 1 }]),
    );
    for (const id of notes.keys()) ids.add(id);
    return [...ids].flatMap((id) => {
      const element = ELEMENT_BY_ID.get(id);
      if (!element) return [];
      const verdict = session.selection?.element === id ? session.selection.verdict?.kind : undefined;
      const note = notes.get(id);
      return [{
        id,
        point: element.position as [number, number, number],
        // A note about something on another storey recedes: the learner cannot
        // walk to it from here, so it should not compete with what is in front
        // of them.
        tone: verdict === "correct"
          ? "cool"
          : verdict === "near"
            ? "warm"
            : verdict
              ? "alert"
              : note && element.level === session.level
                ? "cool"
                : "neutral",
        onSelect: session.status !== "running" || session.step?.mode === "select"
          ? () => {
              if (!training) return;
              showSelectionResult(training.toggleSelection(id));
            }
          : undefined,
        children: note ? (
          <>
            <b className="block">{note.ordinal}. {element.name}</b>
            <span className="mt-0.5 block text-[10px] font-normal leading-[1.4] opacity-70">
              {element.level === 0 ? "Ground floor" : "First floor"}
              {element.room ? ` · ${ROOMS.find((room) => room.id === element.room)?.name ?? element.room}` : ""}
            </span>
            <span className="mt-1 block max-w-44 text-pretty text-[11px] font-normal leading-[1.45] opacity-90">
              {note.text}
            </span>
          </>
        ) : (
          <b>{element.name}</b>
        ),
      } satisfies Marker];
    });
  }, [
    session.annotations,
    session.level,
    session.revealed,
    session.selection,
    session.status,
    session.step?.mode,
    showSelectionResult,
    training,
  ]);

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

  /** The crosshair is over something selectable. */
  const aimed = !!hover?.fromCentre;

  const hudStages = missionStages(session.mission);
  const hudStageLabel = hudStages.length
    ? `${session.stepIndex + 1} of ${hudStages.length} · ${hudStages[session.stepIndex]?.label ?? ""}`
    : "";

  // While the pointer is ours, "what am I looking at" is whatever the crosshair
  // is over, so the label has to follow the camera rather than the pointer.
  // Throttled, and only committed when the component under the reticle actually
  // changes — a raycast every frame to re-render the same name is wasted work.
  useEffect(() => {
    if (!looking) return;
    // Taking the pointer starts from nothing known, so the same component
    // under the reticle still counts as a change and the label comes back.
    hoverIdRef.current = null;
    let raf = 0;
    let last = 0;
    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (time - last < 60) return;
      last = time;
      const rect = viewerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const element = sceneRef.current?.pick(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        { ...pickContext(), tolerancePx: 18 },
      );
      if ((element?.id ?? null) === hoverIdRef.current) return;
      hoverIdRef.current = element?.id ?? null;
      setHover(element
        ? {
            id: element.id,
            name: element.name,
            system: element.system,
            x: rect.width / 2,
            y: rect.height / 2,
            fromCentre: true,
          }
        : undefined);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [looking, pickContext]);

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

  const walkToNote = useCallback(
    (id: string) => {
      if (!training) return;
      // Recorded before the camera moves: one audit trail, and a learner
      // choosing which note to look at again is a choice like any other.
      training.revisit(id);
      void frameElement(training, id);
    },
    [training],
  );

  const toggleSection = () => {
    training?.openCeiling(!sectionOn);
  };

  const returnToOverview = useCallback(() => {
    training?.exitWalk();
    training?.setSection(CUTAWAY_Y);
    sceneRef.current?.setCeiling(false);
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
        onHome={() => {
          pickRole("");
          setActivityPaneOpen(false);
          setMissionPaneOpen(true);
        }}
        tools={tools}
        step={session.status === "running" ? session.step : undefined}
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

      <main id="training-workspace" className="workspace-grid" data-touring={tourFrom ? "" : undefined}>
        <TrainingPanel
          tools={tools}
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
          data-walking={walking || undefined}
          data-looking={looking || undefined}
          data-look-mode={walking ? lookMode : undefined}
          onPointerDownCapture={onPointerDown}
          onPointerMoveCapture={onPointerMove}
          onPointerUpCapture={onPointerUp}
          onPointerCancelCapture={onPointerCancel}
          onPointerLeave={() => {
            // While the pointer is locked the label belongs to the camera, so
            // leaving for the sidebar must not clear it. Clearing it without
            // also resetting the id the loop compares against is what desynced
            // them once: the loop saw "same component, nothing to do" and the
            // label never came back.
            if (looking) return;
            hoverIdRef.current = null;
            setHover(undefined);
          }}
          onClickCapture={onViewerClickCapture}
        >
          <div ref={containerRef} className="absolute inset-0" />
          <StageStatus status={status} error={error} />

          {/* Below 1500px the mission panel is a drawer, so the objective and
              the floor plan ride on the model instead. */}
          <ViewerHud
            session={session}
            stageLabel={hudStageLabel}
            hidden={missionPaneOpen}
            touring={!!tourFrom}
            onWalkNote={walkToNote}
          />
          <ViewerMarkers getStage={getStage} markers={[...roomSigns, ...markers]} />

          {looking ? (
            // Honest only while the pointer is ours: with no cursor on screen,
            // the reticle genuinely is the aim point. It opens up the moment it
            // is over something selectable — an indicator that never reacts is
            // one you have to be told about; this one says it itself.
            // Monochrome, because it is chrome and state, not an accent.
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden="true">
              <div
                className={cn(
                  "size-4 rounded-full border transition-[transform,border-color] duration-[120ms] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none",
                  aimed ? "scale-[1.35] border-foreground" : "border-foreground/65",
                )}
              />
              <div
                className={cn(
                  "absolute rounded-full bg-foreground transition-[width,height,opacity] duration-[120ms] [transition-timing-function:var(--ease-out)] motion-reduce:transition-none",
                  aimed ? "size-1.5 opacity-100" : "size-1 opacity-90",
                )}
              />
            </div>
          ) : null}

          <WalkControls
            walking={walking}
            looking={looking}
            mode={lookMode}
            onLook={takeLook}
          />

          {hover && hover.fromCentre === looking ? (
            <div
              className="pointer-events-none absolute z-30 max-w-56 translate-x-3 translate-y-3 rounded-md border border-border bg-background/95 px-2.5 py-2"
              style={{ left: hover.x, top: hover.y }}
            >
              <div className="text-[13px] font-semibold leading-[1.4]">{hover.name}</div>
              <div className="mt-0.5 font-mono text-[11px] leading-[1.4] text-text-tertiary">{hover.system} · {hover.id}</div>
            </div>
          ) : null}

          {notice ? (
            <div
              aria-live="polite"
              className={`pointer-events-none absolute top-[4.75rem] z-30 flex px-4 ${
                notice.anchor === "activity"
                  ? // Under the toggle it is asking for, at any width: the
                    // viewer's right edge is the window's in both layouts.
                    "right-0 justify-end"
                  : "inset-x-0 justify-center"
              }`}
            >
              <div className={`surface-pop flex max-w-lg items-center gap-2 rounded-md border px-3 py-2 text-center text-[12px] font-medium tone-${notice.tone}`}>
                <span>{notice.message}</span>
                {notice.action ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    data-viewer-ui=""
                    onClick={notice.action.run}
                    className="pointer-events-auto -mr-1 text-interactive hover:text-foreground"
                  >
                    {notice.action.label}
                  </Button>
                ) : null}
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

          {/* Persistent scene context belongs above the model, clear of the canvas centre. */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
            <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-background/90 py-1.5 pl-3 pr-1.5 text-[12px]">
              <span className="leading-[1.4]">
                <span className="font-semibold">{roleLabel ?? "Choose a scenario"}</span>
                <span className="text-muted-foreground"> · L{session.level} · {locationLabel}</span>
              </span>

              {/* The movement keys and the way out live on the walk controls
                  over the model, where someone in first person is actually
                  looking — not squeezed into a bar above it. */}

              {session.status === "running" ? (
                <span className="workspace-viewer-objective flex items-center gap-1 text-muted-foreground">
                  {session.step?.mode === "reach" ? (
                    <>Reach {destinationLabel ?? "the target room"}</>
                  ) : walking && !looking && lookMode === "click" ? (
                    <><MousePointer2 className="size-3" aria-hidden="true" /> Click the model to look around</>
                  ) : session.selection && !session.selection.verdict ? (
                    <><MousePointer2 className="size-3" aria-hidden="true" /> Click it again to clear</>
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
