# WebMCP Challenge release notes

## Submission facts

- Category: WebMCP app.
- Deadline: September 3, 2026 at 1:00 PM Pacific Time (3:00 PM in Bogotá).
- Runtime: publicly accessible Vercel deployment with no sign-in or paid dependency.
- Source: public repository with an OSI-approved MIT License.
- Demo: public YouTube video, under three minutes, in English with audible narration.

## What the judges should try

1. Start **Leak in Room 214**.
2. Ask the agent: “Read the current Drill Day session. Coach me through the objective without locating or revealing the answer.”
3. Attempt `training_locate_element` during the navigation step and observe the deterministic refusal in the activity log.
4. Walk to Room 214 with the default-open floor plan tracking the route, request a hint, and use the clickable marker or tolerant 3D selection.
5. After identifying the leak, follow the inline wayfinding guidance to the riser cupboard. Choose the downstream terminal valve and compare its near-miss diagnosis with the correct floor isolation.
6. Run **Agent-authored drill** to show that the agent can browse real building elements, construct a mission with checked IDs, and launch it in the same scene.

## Judging alignment

### WebMCP leverage

- 13 discoverable tools operate against shared, live page state.
- Tools cover read, action, coaching, replay, and runtime mission authoring.
- Instructional allow lists demonstrate that tool availability can be part of the simulation—not merely an API wrapper.
- Strict schemas, annotations, input bounds, async execution, and visible outcomes follow the current proposal.

### Execution

- Tokenless Autodesk Scene API model with deterministic training graph.
- Small-object tolerant picking with occlusion guard and accessible marker fallback.
- First-person walk listener is active only during BimWalk, preventing orbit, replay, or camera tools from completing navigation.
- Unified audit trail makes agent actions legible to the learner and to a recorded audience.

### Impact

The same pattern can train facility technicians, safety inspectors, firefighters, commissioning engineers, contractors, and operators. It turns static BIM knowledge into situated practice without requiring a bespoke simulation engine or uploaded proprietary model for this demo.

### Creativity and ambition

The agent does not just answer questions. It shares a spatial environment, respects the lesson's rules, explains misconceptions, replays decisions, and composes new grounded drills out of the building's actual graph.

## Work completed after August 25, 2026

The earlier proof of concept lived in a separate local `layer0` workspace. This standalone repository and its challenge release work were created after the eligibility date:

- Current Next.js 16 App Router scaffold and Vercel packaging.
- Reauthored flagship flow, instructions, and visual hierarchy.
- GPT Image incident brief and corresponding Scene API environmental pass.
- Room signage, hazard thresholds, leak puddle, and equipment detail.
- Human/scene/agent activity timeline.
- Strict WebMCP schemas, guarded tool sets, and clear native/polyfill status.
- Singular toggleable selection, clickable markers, pointer gesture safety, and selection feedback.
- Default-open floor plan keeps route history legible without drawing it over the 3D building.
- BimWalk lifecycle and stale-async protections.
- Open-source license, notices, provenance, and release documentation.

Repository commit dates are the authoritative record.

## Final submission checklist

- [ ] Live Vercel URL opens in a private browser session.
- [ ] Public GitHub repository includes all source, assets, setup instructions, MIT `LICENSE`, and notices.
- [ ] Native WebMCP browser discovers all 13 tools.
- [ ] Flagship CTA, guardrail, hint, near miss, correct isolation, replay, and agent-authored drill are smoke-tested.
- [ ] Public YouTube demo is under three minutes, has audible English narration, and shows the URL.
- [ ] Challenge explanation clearly distinguishes the prior proof of concept from post-August-25 work.
- [ ] Submission is sent before the deadline.
