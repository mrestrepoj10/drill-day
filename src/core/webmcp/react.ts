"use client"

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { ensureModelContext, modelContextFlavor, type ModelContextFlavor } from "./polyfill"
import { asPageCall, toolJournal } from "./journal"
import type { ModelContextTool, RegisteredTool, ToolCall } from "./types"

/* eslint-disable @typescript-eslint/no-explicit-any */

const toolChangeSubscribers = new Set<() => void>()
let toolChangeQueued = false

function notifyToolChange(): void {
  if (toolChangeQueued) return
  toolChangeQueued = true
  queueMicrotask(() => {
    toolChangeQueued = false
    for (const subscriber of toolChangeSubscribers) subscriber()
  })
}

function subscribeToRegisteredTools(onChange: () => void): () => void {
  toolChangeSubscribers.add(onChange)
  return () => toolChangeSubscribers.delete(onChange)
}

/**
 * Declares tools on `document.modelContext` for as long as the component is
 * mounted.
 *
 * Registration is keyed on the *names*, not on the closures: the tools array is
 * kept in a ref and each registered `execute` dispatches to the newest
 * declaration by name. That matters because these tools read live application
 * state — re-registering on every state change would churn the agent's tool
 * list several times a second, and the spec's only teardown is an AbortSignal.
 */
export function useModelContextTools(tools: ModelContextTool<any>[]): void {
  const latest = useRef(tools)
  const key = tools.map((t) => t.name).join("|")

  useEffect(() => {
    latest.current = tools
  }, [tools])

  useEffect(() => {
    const ctx = ensureModelContext()
    const controller = new AbortController()
    for (const declared of latest.current) {
      const proxy: ModelContextTool<any> = {
        name: declared.name,
        title: declared.title,
        description: declared.description,
        inputSchema: declared.inputSchema,
        annotations: declared.annotations,
        execute: (input, options) => {
          const live = latest.current.find((t) => t.name === declared.name) ?? declared
          return live.execute(input, options)
        },
      }
      ctx
        .registerTool(toolJournal.instrument(proxy), { signal: controller.signal })
        .then(notifyToolChange)
        .catch((e) => {
          // React Strict Mode immediately cleans up its first effect pass. A
          // native implementation may reject that aborted registration.
          if (!controller.signal.aborted || e?.name !== "AbortError") {
            console.warn(`[webmcp] registerTool(${declared.name})`, e)
          }
        })
    }
    return () => {
      controller.abort()
      notifyToolChange()
    }
  }, [key])
}

/** Live view of what is registered and what has been called. */
export function useModelContext(): {
  flavor: ModelContextFlavor
  tools: RegisteredTool[]
  calls: readonly ToolCall[]
  /** Invoke a tool the way an agent would — through `executeTool`. */
  run: (name: string, input?: object) => Promise<string>
  clear: () => void
} {
  const [tools, setTools] = useState<RegisteredTool[]>([])
  const flavor: ModelContextFlavor =
    typeof document === "undefined" ? "native" : modelContextFlavor()

  useEffect(() => {
    const ctx = ensureModelContext()
    let active = true
    const sync = () =>
      void ctx.getTools().then((next) => {
        if (active) setTools(next)
      })

    const unsubscribeRegisteredTools = subscribeToRegisteredTools(sync)
    const unsubscribeNativeChanges = subscribeToNativeToolChanges(ctx, sync)
    sync()
    return () => {
      active = false
      unsubscribeRegisteredTools()
      unsubscribeNativeChanges()
    }
  }, [])

  const calls = useSyncExternalStore(subscribeToJournal, getJournal, getJournal)

  const run = useCallback(async (name: string, input: object = {}) => {
    const ctx = ensureModelContext()
    const registered = (await ctx.getTools()).find((t) => t.name === name)
    if (!registered) throw new Error(`no tool named "${name}"`)
    // The draft passes the input as an object; some native hosts want the
    // JSON-serialized form instead. Fall back when only the shape is rejected.
    return asPageCall(async () => {
      try {
        return await ctx.executeTool(registered, input)
      } catch (cause) {
        if (!isInputShapeError(cause)) throw cause
        return ctx.executeTool(registered, JSON.stringify(input) as unknown as object)
      }
    })
  }, [])

  return { flavor, tools, calls, run, clear: () => toolJournal.clear() }
}

/** A host rejecting the *encoding* of the input, as opposed to the tool failing. */
function isInputShapeError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause)
  return /parse input|not of type/i.test(message)
}

function subscribeToJournal(onChange: () => void): () => void {
  toolJournal.addEventListener("change", onChange)
  return () => toolJournal.removeEventListener("change", onChange)
}

function getJournal(): readonly ToolCall[] {
  return toolJournal.list()
}

/**
 * The draft spec makes ModelContext an EventTarget, but early browser hosts can
 * expose only its three methods. Feature-detect the event surface so those
 * implementations can still register and execute tools.
 */
function subscribeToNativeToolChanges(
  ctx: ReturnType<typeof ensureModelContext>,
  onChange: () => void,
): () => void {
  const candidate = ctx as unknown as {
    addEventListener?: (type: string, listener: EventListener) => void
    removeEventListener?: (type: string, listener: EventListener) => void
    ontoolchange?: ((event: Event) => unknown) | null
  }

  if (
    typeof candidate.addEventListener === "function" &&
    typeof candidate.removeEventListener === "function"
  ) {
    candidate.addEventListener("toolchange", onChange)
    return () => candidate.removeEventListener?.("toolchange", onChange)
  }

  if ("ontoolchange" in candidate) {
    const previous = candidate.ontoolchange ?? null
    const handler = (event: Event) => {
      previous?.(event)
      onChange()
    }
    candidate.ontoolchange = handler
    return () => {
      if (candidate.ontoolchange === handler) candidate.ontoolchange = previous
    }
  }

  return () => undefined
}
