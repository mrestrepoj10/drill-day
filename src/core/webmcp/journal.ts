import type { ModelContextTool, ToolCall } from "./types"

/**
 * The page's own record of what was called on it.
 *
 * WebMCP gives a page no callback for "an agent invoked you" — the browser
 * calls `execute` and that is the whole signal. So the journal is built the
 * only way it can be: by wrapping each declaration's `execute` before handing
 * it to `registerTool`. Every call an agent makes therefore lands in the same
 * feed as the ones the page makes locally, which is what lets the UI show the
 * agent's work as it happens.
 */
class ToolJournal extends EventTarget {
  private entries: ToolCall[] = []
  private seq = 0
  private limit = 200

  list(): readonly ToolCall[] {
    return this.entries
  }

  clear(): void {
    this.entries = []
    this.dispatchEvent(new Event("change"))
  }

  private push(call: ToolCall): void {
    this.entries = [...this.entries, call].slice(-this.limit)
    this.dispatchEvent(new Event("change"))
  }

  private settle(id: number, patch: Partial<ToolCall>): void {
    this.entries = this.entries.map((e) => (e.id === id ? { ...e, ...patch } : e))
    this.dispatchEvent(new Event("change"))
  }

  /** Wraps a declaration so every invocation is journalled. */
  instrument<T>(tool: ModelContextTool<T>): ModelContextTool<T> {
    return {
      ...tool,
      execute: async (input, options) => {
        const id = ++this.seq
        const startedAt = Date.now()
        this.push({
          id,
          name: tool.name,
          input,
          origin: callOrigin,
          readOnly: tool.annotations?.readOnlyHint ?? false,
          startedAt,
        })
        try {
          const result = await tool.execute(input, options)
          this.settle(id, { result, durationMs: Date.now() - startedAt })
          return result
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e)
          this.settle(id, { error, durationMs: Date.now() - startedAt })
          throw e
        }
      },
    }
  }
}

export const toolJournal = new ToolJournal()

// Calls the page makes on itself are tagged so the feed can tell "the agent did
// this" apart from "the console did this". Anything else is assumed to be the
// agent, because that is the only other party holding the tool.
let callOrigin: ToolCall["origin"] = "agent"

/** Runs `fn` with journal entries tagged as page-originated. */
export async function asPageCall<T>(fn: () => Promise<T>): Promise<T> {
  callOrigin = "page"
  try {
    return await fn()
  } finally {
    callOrigin = "agent"
  }
}
