// @layer0/webmcp — the page half of the proposed WebMCP standard.
//
// Spec: https://webmachinelearning.github.io/webmcp/
// ChatGPT Site tools: https://learn.chatgpt.com/codex/webmcp
//
// A page declares tools on `navigator.modelContext`; an agentic browser
// (ChatGPT desktop, Codex) discovers them on visit and calls them while the
// human is still looking at the same tab. There is no server, no separate
// session, no copy of the state: the tool runs in the page, against whatever
// the user is currently seeing.

export * from "./types"
export { ensureModelContext, modelContextFlavor, type ModelContextFlavor } from "./polyfill"
export { toolJournal, asPageCall } from "./journal"
export { pushAmbientContext } from "./context"
export { useModelContextTools, useModelContext } from "./react"

/** Small helper for the `inputSchema` boilerplate. */
export function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false }
}
