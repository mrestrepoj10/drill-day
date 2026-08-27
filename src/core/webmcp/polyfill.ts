import type {
  ExecuteToolOptions,
  GetToolOptions,
  ModelContext,
  ModelContextTool,
  RegisterToolOptions,
  RegisteredTool,
} from "./types"

/**
 * A same-document implementation of the `ModelContext` interface for browsers
 * that do not ship WebMCP yet.
 *
 * It is deliberately faithful rather than convenient: same method names, same
 * duplicate-name rejection, same `toolchange` event, same "resolves to the
 * stringified result" contract for `executeTool`. Pages written against the
 * polyfill run unchanged in an agentic browser, where the native object wins
 * and the polyfill is never installed.
 *
 * What it cannot fake is the other half of the standard — tool discovery by an
 * out-of-page agent. Locally, the page is the only caller.
 */
class PolyfilledModelContext extends EventTarget implements ModelContext {
  /** name → declaration. Registration order is the listing order. */
  private tools = new Map<string, ModelContextTool<never>>()

  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null = null

  constructor() {
    super()
    this.addEventListener("toolchange", (ev) => this.ontoolchange?.call(this, ev))
  }

  async registerTool(
    tool: ModelContextTool<never>,
    options: RegisterToolOptions = {},
  ): Promise<void> {
    if (!tool?.name || !tool.description || typeof tool.execute !== "function") {
      throw new TypeError("registerTool: name, description and execute are required")
    }
    if (this.tools.has(tool.name)) {
      throw new DOMException(`Tool "${tool.name}" is already registered`, "InvalidStateError")
    }
    this.tools.set(tool.name, tool)
    // The spec gives no `unregisterTool`: teardown is the AbortSignal.
    options.signal?.addEventListener("abort", () => {
      if (this.tools.get(tool.name) === tool) {
        this.tools.delete(tool.name)
        this.dispatchEvent(new Event("toolchange"))
      }
    })
    this.dispatchEvent(new Event("toolchange"))
  }

  async getTools(options: GetToolOptions = {}): Promise<RegisteredTool[]> {
    void options
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
      window,
      origin: location.origin,
    }))
  }

  async executeTool(
    tool: RegisteredTool,
    input: object = {},
    options: ExecuteToolOptions = {},
  ): Promise<string> {
    const declaration = this.tools.get(tool.name)
    if (!declaration) {
      throw new DOMException(`Tool "${tool.name}" is not registered`, "NotFoundError")
    }
    const controller = new AbortController()
    options.signal?.addEventListener("abort", () => controller.abort())
    const result = await declaration.execute(input as never, { signal: controller.signal })
    // Spec: executeTool resolves to the stringified result.
    return typeof result === "string" ? result : JSON.stringify(result ?? null)
  }
}

export type ModelContextFlavor = "native" | "polyfill"

let flavor: ModelContextFlavor = "native"

/**
 * Returns `document.modelContext`, installing the polyfill first if the
 * browser has no native implementation. Idempotent.
 */
export function ensureModelContext(): ModelContext {
  if (typeof document === "undefined") {
    throw new Error("ensureModelContext is browser-only")
  }
  if (typeof document.modelContext?.registerTool === "function") {
    return document.modelContext
  }
  flavor = "polyfill"
  const ctx = new PolyfilledModelContext()
  Object.defineProperty(document, "modelContext", {
    value: ctx,
    configurable: true,
    writable: false,
  })
  return ctx
}

/** Whether the page is talking to a real agentic browser or to the polyfill. */
export function modelContextFlavor(): ModelContextFlavor {
  return flavor
}
