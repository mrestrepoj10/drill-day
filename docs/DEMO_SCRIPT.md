# Demo script — target 2:25

## 0:00–0:18 — premise

> Training from a manual tells you what a valve is. Drill Day puts you in the building at 07:42, with water coming through the ceiling, and asks you to make the safe call. The learner and ChatGPT share the same live Autodesk Scene API model.

Show the launch screen, generated incident brief, three stages, role-aware challenge header, Scene API badge, and 13-site-tool badge. Start the flagship drill.

## 0:18–0:48 — situated navigation

> The first task is spatial: find Room 214 on foot. The plan reports position, but it cannot teleport me. Level shortcuts, search, locate, and manual advance are disabled because wayfinding is the exercise.

Walk far enough to show the route updating in the default-open floor plan while the 3D scene stays uncluttered. Point out that Learning cues emphasizes the full set of relevant room signs in both views without identifying Room 214, then toggle the cues off and on to land the learner choice in the activity feed. The active stage still carries the instruction in one progress surface.

## 0:48–1:15 — WebMCP and guardrails

> ChatGPT can read the exact live session through WebMCP, including where I am, the active prompt, attempts, hints, and allowed tools. If it tries to locate the answer, the page refuses the call and records that guardrail. It can still inspect a named component or spend a hint.

Run **Prove the guardrail**. Keep the refusal and allowed read/hint calls visible in the unified log.

## 1:15–1:48 — diagnosis and teaching

> Once inside Room 214, the scene opens the real diagnosis: the fan coil is wet, but water runs downhill. The leaking part is the split drop above it. Picking has screen-space tolerance for small services and still refuses targets hidden behind walls. A wrong-but-plausible valve gets a specific explanation, not a generic failure.

Show how Learning cues gives the leak and its plausible near misses the same blue treatment in the plan and Scene API model without identifying the answer. Spend a hint to contrast its specific amber reveal, select the leak, and call out the new “Next move” directions to the riser cupboard. Choose the Room 214 terminal valve as a near miss, note that its feedback is labeled for the Isolate stage, click it again to clear the selection, then select the first-floor chilled-water isolation as the correct answer. Briefly show the completion debrief and its primary Replay action.

## 1:48–2:10 — agent-authored training

> The most ambitious part is that the agent can build the next drill. It browses the actual fire elements in this model, writes a mission from checked stable IDs, defines meaningful near misses, and launches it in the same scene. Hallucinated element IDs are rejected before the learner ever sees the exercise.

Run **Agent-authored drill** and show its first prompt.

## 2:10–2:25 — close

> Drill Day is a standalone Next.js 16 app, deployed on Vercel and open source under MIT. Autodesk provides the live scene; WebMCP gives the agent safe, visible agency inside it. The result is not a chatbot beside a model—it is a building that can teach back.

End on the overview and repository/live-demo links.
