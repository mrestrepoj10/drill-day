import Link from "next/link";
import { Activity, Box, PanelLeft } from "lucide-react";
import type { RegisteredTool } from "@layer0/webmcp";
import type { TrainingStep } from "@layer0/viewer-training";
import { AgentToolsBadge } from "@/components/training/tool-access";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface WorkspaceHeaderProps {
  context: string;
  missionPaneOpen: boolean;
  activityPaneOpen: boolean;
  unseenActivity: number;
  onToggleMission: () => void;
  onToggleActivity: () => void;
  /** Everything registered on `navigator.modelContext`. */
  tools: RegisteredTool[];
  /** The open step, whose allow list the badge reports. */
  step: TrainingStep | undefined;
}

export function WorkspaceHeader({
  context,
  missionPaneOpen,
  activityPaneOpen,
  unseenActivity,
  onToggleMission,
  onToggleActivity,
  tools,
  step,
}: WorkspaceHeaderProps) {
  return (
    <header
      className="workspace-navbar"
      data-mission-pane-open={missionPaneOpen}
    >
      <div className="workspace-navbar-start">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Toggle mission panel"
              aria-controls="mission-panel"
              aria-expanded={missionPaneOpen}
              onClick={onToggleMission}
              className="workspace-panel-trigger hidden max-[1499px]:inline-flex"
            >
              <PanelLeft aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>Mission panel</TooltipContent>
        </Tooltip>

        <Link href="/" className="workspace-brand" aria-label="Drill Day home">
          <Box className="workspace-brand-mark" aria-hidden="true" strokeWidth={1.8} />
          <span>Drill Day</span>
        </Link>
        <span className="workspace-context-separator" aria-hidden="true">/</span>
        <span className="workspace-brand-context" title={context}>{context}</span>
      </div>

      <nav className="workspace-navbar-actions" aria-label="Workspace utilities">
        {/* The guardrail is the thing this page is arguing for, so it sits on
            the one surface that is present at every width and pane state. */}
        <AgentToolsBadge tools={tools} step={step} />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={
            unseenActivity
              ? `Agent activity, ${unseenActivity} new events`
              : "Agent activity"
          }
          aria-controls="agent-console"
          aria-expanded={activityPaneOpen}
          onClick={onToggleActivity}
          className="workspace-activity-action"
        >
          <Activity aria-hidden="true" />
          <span className="workspace-trigger-label">Activity</span>
          {unseenActivity > 0 ? (
            <span
              key={unseenActivity}
              className="workspace-activity-count"
              aria-hidden="true"
            >
              {unseenActivity}
            </span>
          ) : null}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" className="workspace-source-action">
              <Link
                href="https://github.com/mrestrepoj10/drill-day"
                target="_blank"
                rel="noreferrer"
                aria-label="View source on GitHub"
              >
                <GitHubMark />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>View source on GitHub</TooltipContent>
        </Tooltip>
      </nav>
    </header>
  );
}

function GitHubMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18A11 11 0 0 1 12 6.11c.98 0 1.95.13 2.87.39 2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.27c0 .31.21.67.8.55A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}
