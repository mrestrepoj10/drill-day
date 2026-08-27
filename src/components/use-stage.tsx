"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createLocalScene, type LocalViewerHandle } from "@layer0/viewer";
import { Stage } from "@layer0/scene-render";

/**
 * Boots a tokenless viewer into `containerRef` and hands back a `Stage`.
 *
 * `onReady` runs once the dynamic model is showing, which is the only safe
 * moment to start adding instances.
 */
export function useStage(
  containerRef: RefObject<HTMLDivElement | null>,
  onReady?: (stage: Stage, handle: LocalViewerHandle) => void,
) {
  const stageRef = useRef<Stage | null>(null);
  const handleRef = useRef<LocalViewerHandle | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>();
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    (async () => {
      try {
        const handle = await createLocalScene(containerRef.current!);
        if (cancelled) return handle.dispose();
        dispose = handle.dispose;
        handleRef.current = handle;
        const stage = new Stage(handle);
        stageRef.current = stage;
        ready.current?.(stage, handle);
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      dispose?.();
      stageRef.current = null;
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Accessors rather than the refs themselves: callers read the stage when
  // they act, never while rendering.
  const getStage = useCallback(() => stageRef.current, []);
  const getHandle = useCallback(() => handleRef.current, []);

  return { getStage, getHandle, status, error };
}

export function StageStatus({ status, error }: { status: string; error?: string }) {
  if (status === "ready") return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
      {status === "loading" ? "booting viewer…" : `error: ${error}`}
    </div>
  );
}
