import { Check, MapPinned, ShieldAlert } from "lucide-react";
import type { Decision, TrainingSession } from "@layer0/viewer-training";
import { cn } from "@/lib/utils";

export interface MissionStageView {
  id: string;
  label: string;
  prompt: string;
}

export function MissionProgress({
  session,
  stages,
}: {
  session: TrainingSession;
  stages: MissionStageView[];
}) {
  const activeFeedback = session.step
    ? session.decisions.findLast(
        (decision) => decision.stepId === session.step?.id && decision.verdict,
      )
    : undefined;

  return (
    <section className="border-b border-border px-5 py-4">
      <ol aria-label="Mission progress">
        {stages.map((stage, index) => {
          const cleared = Boolean(session.progress[index]?.cleared);
          const current = index === session.stepIndex && session.status === "running";

          return (
            <li
              key={stage.id}
              className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3"
              aria-current={current ? "step" : undefined}
            >
              <div className="flex min-h-full flex-col items-center" aria-hidden="true">
                <ProgressDot index={index} cleared={cleared} current={current} />
                {index < stages.length - 1 ? (
                  <span
                    className={cn(
                      "my-1 min-h-3 w-px flex-1 transition-colors duration-150 [transition-timing-function:var(--ease-out)]",
                      cleared ? "bg-success/35" : "bg-border",
                    )}
                  />
                ) : null}
              </div>

              <div className={cn("min-w-0", index < stages.length - 1 && "pb-4")}>
                <div
                  className={cn(
                    "text-[12px] font-semibold leading-5 transition-colors duration-150 [transition-timing-function:var(--ease-out)]",
                    current
                      ? "text-foreground"
                      : cleared
                        ? "text-success"
                        : "text-text-tertiary",
                  )}
                >
                  {index + 1} of {stages.length} · {stage.label}
                  {cleared ? <span className="sr-only">, complete</span> : null}
                </div>

                {current ? (
                  <div className="surface-pop">
                    {/* One notch below the mission title: the title names the
                        lesson, the prompt is an instruction — same voice,
                        smaller room. */}
                    <h2 className="mt-1.5 text-pretty text-[15px] font-medium leading-[1.45] tracking-[-0.01em] text-foreground/95">
                      {stage.prompt}
                    </h2>

                    {session.step?.guidance ? (
                      <div className="mt-3 flex gap-2.5 border-l border-interactive/45 pl-3">
                        <MapPinned className="mt-0.5 size-3.5 shrink-0 text-interactive" aria-hidden="true" />
                        <div>
                          <p className="text-[11px] font-semibold leading-[1.4] text-interactive">Next move</p>
                          <p className="mt-0.5 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                            {session.step.guidance}
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {session.step?.allowedTools ? (
                      // A guardrail is a feature, so it gets a designed chip,
                      // not a bare warning line.
                      <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-warning/25 bg-warning/10 px-2 py-1 text-[11px] font-medium leading-[1.4] text-warning">
                        <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>Search is disabled for this stage</span>
                      </div>
                    ) : null}

                    {activeFeedback?.verdict ? (
                      <StageFeedback
                        key={`${activeFeedback.at}-${activeFeedback.kind}`}
                        stageLabel={stage.label}
                        decision={activeFeedback}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ProgressDot({
  index,
  cleared,
  current,
}: {
  index: number;
  cleared: boolean;
  current: boolean;
}) {
  return (
    <span
      className={cn(
        "relative flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold transition-[background-color,border-color,color] duration-150 [transition-timing-function:var(--ease-out)]",
        cleared
          ? "border-success/45 bg-success/15 text-success"
          : current
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-muted/30 text-text-tertiary",
      )}
    >
      <span
        className={cn(
          "transition-[opacity,transform] duration-150 [transition-timing-function:var(--ease-out)]",
          cleared ? "scale-95 opacity-0" : "scale-100 opacity-100",
        )}
      >
        {index + 1}
      </span>
      <Check
        className={cn(
          "absolute size-3 transition-[opacity,transform] duration-150 [transition-timing-function:var(--ease-out)]",
          cleared ? "scale-100 opacity-100" : "scale-95 opacity-0",
        )}
        strokeWidth={2.5}
      />
    </span>
  );
}

function StageFeedback({
  stageLabel,
  decision,
}: {
  stageLabel: string;
  decision: Decision;
}) {
  const verdict = decision.verdict;
  if (!verdict) return null;

  return (
    <div
      aria-live="polite"
      className={cn(
        "surface-pop mt-3 rounded-lg border px-3 py-2.5",
        verdict.kind === "correct"
          ? "border-success/25 bg-success/6"
          : verdict.kind === "near"
            ? "border-warning/25 bg-warning/6"
            : "border-destructive/25 bg-destructive/6",
      )}
    >
      <p className="text-[11px] font-semibold leading-[1.4] text-muted-foreground">
        {stageLabel} feedback
      </p>
      <p className="mt-1 text-[12px] font-semibold leading-[1.5]">{verdict.message}</p>
      {verdict.diagnosis ? (
        <p className="mt-1 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
          {verdict.diagnosis}
        </p>
      ) : null}
    </div>
  );
}
