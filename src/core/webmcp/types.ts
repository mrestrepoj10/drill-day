// Types for the proposed WebMCP standard, transcribed from the WebIDL in
// https://webmachinelearning.github.io/webmcp/ and the shape ChatGPT Site
// tools document at https://learn.chatgpt.com/codex/webmcp.
//
// The browser owns `navigator.modelContext` (older hosts: `document.modelContext`);
// a page only ever *declares* tools.
// Everything below is the page-side half of that contract.

/** JSON Schema object describing a tool's arguments. Kept loose on purpose. */
export type JsonSchema = Record<string, unknown>

export interface ToolAnnotations {
  /** Tool does not mutate application state — safe for an agent to call freely. */
  readOnlyHint?: boolean
  /** Tool returns content the page did not author (user input, third-party data). */
  untrustedContentHint?: boolean
}

export interface ToolExecuteOptions {
  /** Aborted when the agent (or the page) cancels the call. */
  signal: AbortSignal
}

/** A tool as the page declares it. */
export interface ModelContextTool<Input = Record<string, never>> {
  name: string
  title?: string
  description: string
  inputSchema?: JsonSchema
  annotations?: ToolAnnotations
  execute: (input: Input, options: ToolExecuteOptions) => unknown | Promise<unknown>
}

/** A tool as the browser hands it back from `getTools()`. */
export interface RegisteredTool {
  name: string
  title?: string
  description: string
  inputSchema?: JsonSchema
  annotations?: ToolAnnotations
  window: Window
  origin: string
}

export interface RegisterToolOptions {
  /** Origins allowed to see the tool. Omitted = the document's own origin. */
  exposedTo?: string[]
  /** Unregisters the tool when aborted — the spec's only teardown path. */
  signal?: AbortSignal
}

export interface GetToolOptions {
  fromOrigins?: string[]
}

export interface ExecuteToolOptions {
  signal?: AbortSignal
}

export interface ModelContext extends EventTarget {
  registerTool(tool: ModelContextTool<never>, options?: RegisterToolOptions): Promise<void>
  getTools(options?: GetToolOptions): Promise<RegisteredTool[]>
  /** Resolves to the *stringified* result, per spec. */
  executeTool(
    tool: RegisteredTool,
    input?: object,
    options?: ExecuteToolOptions,
  ): Promise<string>
  ontoolchange: ((this: ModelContext, ev: Event) => unknown) | null
}

declare global {
  interface Navigator {
    modelContext?: ModelContext
  }
  interface Document {
    modelContext?: ModelContext
  }
}

/** One entry in the call journal the page keeps for its own UI. */
export interface ToolCall {
  id: number
  name: string
  input: unknown
  /** Where the call came from, as far as the page can tell. */
  origin: "agent" | "page"
  readOnly: boolean
  startedAt: number
  durationMs?: number
  result?: unknown
  error?: string
}
