import { VIEWER_SCRIPT_URL, VIEWER_STYLE_URL } from "./urls"
import type { AutodeskViewingGlobal } from "./types"

let loadPromise: Promise<AutodeskViewingGlobal> | null = null

/** Injects the LMV v7 script + stylesheet once and resolves with `Autodesk.Viewing`. */
export function loadViewerRuntime(): Promise<AutodeskViewingGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadViewerRuntime is browser-only"))
  }
  if (window.Autodesk?.Viewing) return Promise.resolve(window.Autodesk.Viewing)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = VIEWER_STYLE_URL
    document.head.appendChild(link)

    const script = document.createElement("script")
    script.src = VIEWER_SCRIPT_URL
    script.onload = () => {
      const av = window.Autodesk?.Viewing
      if (av) resolve(av)
      else reject(new Error("Viewer script loaded but Autodesk.Viewing is missing"))
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error("Failed to load APS Viewer script"))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}
