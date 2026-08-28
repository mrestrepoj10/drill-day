import { CheckCircle2, RotateCcw } from "lucide-react";
import type { TrainingSession } from "@layer0/viewer-training";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function MissionDebrief({
  session,
  onReplay,
  replaying,
}: {
  session: TrainingSession;
  onReplay: () => void;
  replaying: boolean;
}) {
  const mission = session.mission;
  if (!mission) return null;

  const finalStep = mission.steps.at(-1);
  const finalDecision = finalStep
    ? session.decisions.findLast(
        (decision) => decision.stepId === finalStep.id && decision.verdict?.kind === "correct",
      )
    : undefined;
  const finalAction = finalDecision?.verdict?.message;
  const metrics = summarise(session);

  return (
    <section className="border-b border-border p-4">
      <Card className="surface-pop gap-0 border border-success/20 bg-success/6 py-0 ring-0">
        <CardHeader className="gap-2 px-4 py-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {metrics.completed} of {metrics.total} stages complete
          </div>
          <CardTitle className="text-[21px] font-semibold leading-[1.2] tracking-[-0.025em]">
            <h2>Mission complete</h2>
          </CardTitle>
          <CardDescription className="text-[12px] leading-[1.5]">
            The incident is resolved. Review the final action, then replay the decisions that led to it.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-4 pb-4">
          <div className="border-y border-success/15 py-3">
            <p className="text-[11px] font-semibold leading-[1.4] text-success">
              {finalAction ? "Final action" : "Completion note"}
            </p>
            <p className="mt-1 text-pretty text-[13px] font-semibold leading-[1.55]">
              {finalAction ?? "The final stage was advanced without a verified action."}
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <Metric value={`${metrics.completed}/${metrics.total}`} label="Stages cleared" />
            <Metric value={String(metrics.incorrect)} label="Incorrect picks" />
            <Metric value={String(metrics.hints)} label="Hints used" />
            <Metric value={`${metrics.metres} m`} label="Walked" />
          </dl>
        </CardContent>

        <CardFooter className="border-success/15 bg-background/35 p-3">
          <Button
            type="button"
            onClick={onReplay}
            disabled={replaying || !session.decisions.some((decision) => decision.verdict)}
            className="h-10 w-full justify-between px-3 text-[13px] font-semibold"
          >
            <span className="flex items-center gap-2">
              <RotateCcw className="size-4" aria-hidden="true" />
              {replaying ? "Replaying decisions…" : "Replay decisions"}
            </span>
            <span aria-hidden="true">→</span>
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="text-[11px] leading-[1.4] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-[15px] font-semibold leading-[1.3] text-foreground">{value}</dd>
    </div>
  );
}

function summarise(session: TrainingSession) {
  const total = session.progress.length;
  const completed = session.progress.filter((progress) => progress.cleared).length;
  const incorrect = session.decisions.filter(
    (decision) =>
      decision.kind === "select" &&
      decision.verdict &&
      decision.verdict.kind !== "correct",
  ).length;
  const hints = session.progress.reduce((sum, progress) => sum + progress.hintsUsed, 0);
  const metres = Math.round(
    session.trail.reduce((totalDistance, point, index) => {
      if (index === 0) return 0;
      const previous = session.trail[index - 1];
      const distance = Math.hypot(point[0] - previous[0], point[2] - previous[2]);
      return totalDistance + (distance < 6 ? distance : 0);
    }, 0),
  );

  return { completed, total, incorrect, hints, metres };
}
