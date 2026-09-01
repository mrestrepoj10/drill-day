# WebMCP Challenge release notes

## Submission facts

- Category: WebMCP app.
- Deadline: September 3, 2026 at 1:00 PM Pacific Time (3:00 PM in Bogotá).
- Runtime: publicly accessible Vercel deployment with no sign-in or paid dependency.
- Source: public repository with an OSI-approved MIT License.
- Demo: public YouTube video, under three minutes, in English with audible narration.

## What the judges should try

1. Start **Leak in Room 214**.
2. Open **Agent tools** in the navbar before calling anything: it lists all 15 site tools and names the ones this stage has switched off, with what withholding each one teaches.
3. Ask the agent: “Read the current Drill Day session. If it has no mission yet, start the technician one. Then coach me through the objective without locating or revealing the answer.” It works whichever order you paste it in, and it will not overwrite a drill you have already chosen — a finished drill keeps its mission and its debrief, so only an untouched session is started for you.
4. Attempt `training_locate_element` during the navigation step and observe the deterministic refusal in the activity log.
5. Use the default-on Learning cues to compare the same fair candidate context in the floor plan and the 3D model, then toggle it off and on to see that learner choice enter the activity log.
6. Walk to Room 214 with the default-open floor plan tracking the route, request a hint, and use the clickable marker or tolerant 3D selection.
7. Inside Room 214, run **Agent takes the verdict**: the agent answers the step itself with `training_attempt`, receives the same authored near-miss diagnosis a learner would, pins a note onto the component with `training_annotate`, and the step stays open — the verdict is real and deliberately not binding.
8. After identifying the leak, follow the inline wayfinding guidance to the riser cupboard. Choose the downstream terminal valve and compare its near-miss diagnosis with the correct floor isolation.
9. Complete the mission and review the debrief card: final action, session metrics, and primary replay path.
10. From the start screen, run **Let it work alone**: one instruction, eight tool calls, three notes pinned into the 3D scene — the agent browsing, tracing and annotating with no further input. WebMCP gives a page no way to speak first, so this is what agent initiative looks like inside the standard: one prompt worth many calls.
11. Run **Agent-authored drill** to show that the agent can browse real building elements, construct a mission with checked IDs, and launch it in the same scene.

## Judging alignment

### WebMCP leverage

- 15 discoverable tools operate against shared, live page state.
- Tools cover read, action, coaching, answering, replay, and runtime mission authoring.
- Instructional allow lists demonstrate that tool availability can be part of the simulation—not merely an API wrapper. The navbar's **Agent tools** badge states the current stage's allow list before the agent tests it, so the guardrail is legible without a refusal having to happen first.
- `training_attempt` makes the marking symmetric: the agent commits to an answer and takes the same deterministic verdict the learner does, in the same log, without being able to clear the step on the learner's behalf.
- Learner events and each stage's allow list are pushed back to the host as ambient context through `provideContext` where it exists, feature-detected to a silent no-op everywhere else.
- Strict schemas, annotations, input bounds, async execution, and visible outcomes follow the current proposal.

### Execution

- Runtime three.js model with a deterministic training graph; no viewer CDN, token, or uploaded design file.
- Small-object tolerant picking with occlusion guard and accessible marker fallback.
- Shared Learning cues emphasize fair candidate sets in both the plan and the 3D view without identifying the correct answer.
- The first-person walk listener is active only in walk mode, preventing orbit, replay, or camera tools from completing navigation.
- Unified audit trail makes agent actions legible to the learner and to a recorded audience.

### Impact

The same pattern can train facility technicians, safety inspectors, firefighters, commissioning engineers, contractors, and operators. It turns static BIM knowledge into situated practice without requiring a bespoke simulation engine or uploaded proprietary model for this demo.

### Creativity and ambition

The agent does not just answer questions. It shares a spatial environment, respects the lesson's rules, explains misconceptions, replays decisions, and composes new grounded drills out of the building's actual graph.

## Work completed after August 25, 2026

The earlier proof of concept lived in a separate local `layer0` workspace. This standalone repository and its challenge release work were created after the eligibility date:

- Current Next.js 16 App Router scaffold and Vercel packaging.
- Reauthored flagship flow, instructions, and visual hierarchy.
- GPT Image incident brief and the corresponding environmental pass in the scene.
- Room signage, hazard thresholds, leak puddle, and equipment detail.
- Human/scene/agent activity timeline.
- Navbar **Agent tools** badge: the full tool list, with the withheld ones and their reasons, stated before the agent tests them.
- `training_attempt` and `training_annotate`, so the agent can be marked in public and pin coaching onto the component it is about.
- Strict WebMCP schemas, guarded tool sets, and clear native/polyfill status.
- Singular toggleable selection, clickable markers, pointer gesture safety, and selection feedback.
- Default-open floor plan keeps route history legible without drawing it over the 3D building.
- Unified stage progress carries the active instruction, scopes verdict feedback to the stage it grades, and ends in a focused mission debrief.
- Walk-mode lifecycle and stale-async protections.
- Open-source license, notices, provenance, and release documentation.

Repository commit dates are the authoritative record.

## Final submission checklist

- [ ] Live Vercel URL opens in a private browser session.
- [ ] Public GitHub repository includes all source, assets, setup instructions, MIT `LICENSE`, and notices.
- [ ] Native WebMCP browser discovers all 15 tools.
- [ ] Flagship CTA, Agent tools badge, guardrail, hint, agent attempt and pinned note, near miss, correct isolation, replay, and agent-authored drill are smoke-tested.
- [ ] Public YouTube demo is under three minutes, has audible English narration, and shows the URL.
- [ ] Challenge explanation clearly distinguishes the prior proof of concept from post-August-25 work.
- [ ] Submission is sent before the deadline.
