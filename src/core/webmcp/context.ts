import { ensureModelContext, modelContextFlavor } from "./polyfill"

/**
 * Pushes a one-line ambient update to the agent, so it can react to learner
 * events (a room entered, a valve chosen) without being asked.
 *
 * The draft spec's context-provision surface (`provideContext`) is not part of
 * the polyfill and not yet shipped everywhere, so this feature-detects it on
 * the native object and stays a silent no-op otherwise. Only a description is
 * ever passed — never a tool list, which would clobber registered tools.
 *
 * Returns whether the update actually reached a native implementation.
 */
export function pushAmbientContext(text: string): boolean {
  if (typeof document === "undefined" || modelContextFlavor() !== "native") return false
  const ctx = ensureModelContext() as unknown as {
    provideContext?: (params: { description: string }) => unknown
  }
  if (typeof ctx.provideContext !== "function") return false
  try {
    ctx.provideContext({ description: text })
    return true
  } catch {
    return false
  }
}
