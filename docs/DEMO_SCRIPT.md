# Demo script — target 2:40

One loop, three times, at rising stakes: **the agent acts → the page permits or refuses → the learner sees why.**

Every other WebMCP app in the field sells shared state. This one sells the part nobody else has, so the refusal goes first — before the viewer knows what a fan coil is.

## 0:00–0:35 — refused

> It is 07:42 and water is coming through a ceiling tile in Room 214. I am the technician. ChatGPT is on the same page I am, with fifteen site tools. Watch what happens when I ask it to just show me where the room is.

Open on the launch panel: incident brief, three stages, the copyable prompt, and the line that sets up everything — *it can read everything on this page except the answer*. Start the flagship drill and open **Agent tools** in the navbar — all fifteen, with the five this stage withholds named and reasoned, before anything is called. Then run **Prove the guardrail**: `training_locate_element` is refused in the log, with the reason, and so is `training_attempt` — this stage is asking the learner to walk, not to pick.

## 0:35–1:20 — permitted

> Same agent, same session, and the toolset moves with the stage. It cannot locate the answer, but it can read where I am standing, inspect any component by name, and spend a hint.

Walk west along the corridor. The floor plan tracks the route while the 3D scene stays clear. Show Learning cues giving every relevant room sign the same treatment without singling out 214, then toggle them off and on so the learner's own choice lands in the feed. Enter Room 214 and reopen **Agent tools**: it tracks the stage, and goes back to plain grey on a step that withholds nothing.

## 1:20–2:05 — wrong, then right

> Now the real question. The coil is soaked, but water runs downhill. And here is the part I have not seen anywhere else: the agent can answer the step itself, and it is marked by exactly the same rules I am.

Run **Agent takes the verdict**. The agent commits to a plausible wrong answer, gets the authored near-miss diagnosis back in the shared log under its own name, and pins a note onto the component in the scene explaining what it got wrong. Say the important part out loud: **the verdict is real, and it is not binding.** The step does not clear. A coach that could finish the drill for the learner would end the drill.

Then make the call yourself: select the split drop, follow the inline directions to the riser cupboard, take the Room 214 terminal valve as a near miss, and finish on the first-floor chilled-water isolation. Show the debrief and its Replay action.

## Optional cold open — the agent working alone

If the recording needs a moment where nobody is typing, run **Let it work alone** from the start screen before the drill. One instruction, eight calls: it browses the chilled-water system, traces the server room back to the chiller, and pins three notes onto the plant in the 3D scene. Nothing it writes is an answer to any drill — it is the briefing you would get at a shift handover, and starting a mission clears it.

## 2:05–2:40 — authored, and close

> The last thing it can do is write the next drill. It browses the fire equipment that actually exists in this model, composes a mission from checked IDs, and launches it in the same scene. A hallucinated element id is rejected before a learner ever sees the exercise.

Run **Agent-authored drill** and show its first prompt. Close on the activity feed.

> One column. Every actor — me, the scene, the agent. Every permitted call, every refusal, every verdict, including the agent's own. Drill Day is a standalone Next.js app on Vercel, MIT-licensed, rendered with three.js, no server and no backend. Every WebMCP app asks what an agent can do on a page. This one asks what it should be stopped from doing, and makes the refusal part of the lesson.

End on the overview with the repository and live-demo links.
