<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Drill Day

Drill Day is our entry for the **WebMCP challenge**. It is a facilities-training demo where a learner and an AI agent share the same live 3D building: the page exposes 15 `training_*` site tools on `navigator.modelContext` following the **latest WebMCP draft spec** (https://webmachinelearning.github.io/webmcp/), so an agentic browser like ChatGPT can read the scene, coach the learner, and even author new drills — against the exact state the human is looking at.

The rest of this file is good defaults, not hard rules. The developer's instructions override anything here.

## What we can never compromise on

1. **The spec is the pitch.** We track the current WebMCP draft, not a vendored snapshot. Native `navigator.modelContext` first, our polyfill (`src/core/webmcp/polyfill.ts`) as fallback, and newer surfaces (`provideContext` / ambient context) are feature-detected — a host without them gets a silent no-op, never a crash.
2. **Refusals are features.** Instructional guardrails (search disabled, `training_locate_element` blocked mid-exercise) are the most important thing the demo proves. A refused tool call showing up in the log is correct behavior — never "fix" it.
3. **One audit trail.** Every human choice, scene event, and agent tool call lands in the activity feed. Anything new that acts on the session must land there too.
4. **Judged in a small window.** Most reviewers see this inside ChatGPT's embedded browser panel (~1000–1400px wide). The 3D viewer is the only always-on surface; the mission panel and agent console are drawers. Check that width before calling UI work done.
5. **No backend.** Tools run in the page against live scene state. There is no server, no database, no copied session — do not introduce one.

## Glossary

- **learner** — the human walking the building.
- **agent** — the AI calling site tools from the browser host (shown as "ChatGPT" in the feed).
- **flavor** — `native` (real host implementation) vs `polyfill`.
- **mission / step** — a training scenario and its stages; steps are `select` (pick a component) or `reach` (walk somewhere).
- **drill (rehearsal)** — a scripted tool-call sequence in `DRILLS` that demos agent behavior without a real agent.
- **verdict** — correct / near / bad grading of a selection; **coach** — advisory text from agent or system.
- **session** — the live training state (`TrainingSession`), the single source of truth the UI and tools share.

## How it works

`src/core/webmcp` registers tools on `navigator.modelContext` and journals every call. `src/lib/training/tools.ts` declares the 15 tools (constrained JSON Schemas, truthful `readOnlyHint`s, mission-level allow lists). `@layer0/viewer-training` is the session engine — missions, verdicts, guardrails, replay. `@layer0/viewer` + `@layer0/scene-render` are a plain three.js viewport (renderer, camera rig with orbit/walk modes, on-demand render loop) and the stage of shared unit geometries drawn on it. React subscribes to the session via `useSyncExternalStore`; nothing owns state twice.

## Where code lives

- `src/core/*` — framework-agnostic modules, path-aliased as `@layer0/*` in `tsconfig.json` (`webmcp`, `viewer`, `scene-render`, `viewer-training`). React bindings only in `webmcp/react.ts`.
- `src/lib/training` — the facility catalogue, built-in missions, and tool declarations.
- `src/components` — UI. `components/ui/` is shadcn-owned source added via the CLI; extend it there, don't fork styles inline.
- `docs/` — `CHALLENGE.md` (submission notes) and `DEMO_SCRIPT.md` (the under-three-minute walkthrough). Update them when demo-visible behavior changes.

## Verifying

- `pnpm typecheck && pnpm lint` is the standard check. Do not run `pnpm build` or `pnpm verify` unless asked.
- A dev server is usually already running on `:3000` with the developer watching it. Don't kill it, don't start a second one.
- For UI work, sanity-check three widths: ~1280px (ChatGPT panel), <1500px (drawer mode, Escape closes panes), and ≥1500px (mission panel in-flow).

## Design rules

- **shadcn first** (`components.json`, radix-nova style, unified `radix-ui` package). A raw `button`/`input`/`select` where a shadcn primitive exists is a defect.
- **Tokens only, one meaning per color**: monochrome for state and chrome, `--interactive` blue for links and agent accents, `--warning`/`--success`/`--destructive` for verdicts. New colors go through `globals.css` tokens (`color-mix` for tints), never inline hexes.
- Occasional surfaces (toasts, verdicts, feed rows) enter through `.surface-pop`; nothing pops in. Respect `prefers-reduced-motion` (drawers cross-fade).
- The viewer draws no chrome of its own; overlays own the whole canvas, but keep the centre clear for the model.

## Gotchas

- The Next.js block at the top of this file is auto re-added by `next dev`. Leave it in place and keep it committed.
- Tool names are the public API agents see. Renaming a `training_*` tool breaks the suggested prompt, the rehearsal `DRILLS`, and any judge's saved prompt.
- Marker positions are written imperatively (`ViewerMarkers` rAF loop). Don't route per-frame values through React state; the 3D canvas is already painting.
