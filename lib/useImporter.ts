"use client";

import { useCallback, useEffect, useRef } from "react";
import { importData, type ImportFiles, type ImportResult } from "./importer";

/**
 * Runs `importData` in a Web Worker. Starting a new run (or closing the dialog) stops the one in progress, so picking a
 * second file never queues a second full import behind the first. Falls back to running on the page where Workers
 * are not available. A stopped run never answers; callers should ignore it with their own run counter.
 */
export function useImporter() {
  const current = useRef<Worker | null>(null);

  const cancel = useCallback(() => {
    current.current?.terminate();
    current.current = null;
  }, []);

  const run = useCallback(
    (files: ImportFiles, onProgress?: (done: number, total: number) => void): Promise<ImportResult> => {
      cancel();
      return new Promise((resolve, reject) => {
        const inline = () => {
          try {
            resolve(importData(files, onProgress));
          } catch (e) {
            reject(e);
          }
        };
        if (typeof Worker === "undefined") return inline();
        let w: Worker;
        try {
          w = new Worker(new URL("./importWorker.ts", import.meta.url), { type: "module" });
        } catch {
          return inline();
        }
        current.current = w;
        w.onmessage = (e: MessageEvent<{ type: "progress"; done: number; total: number } | { type: "result"; result: ImportResult }>) => {
          if (e.data.type === "progress") return onProgress?.(e.data.done, e.data.total);
          w.terminate();
          if (current.current === w) current.current = null;
          resolve(e.data.result);
        };
        w.onerror = () => {
          w.terminate();
          if (current.current === w) current.current = null;
          inline();
        };
        w.postMessage(files);
      });
    },
    [cancel],
  );

  useEffect(() => cancel, [cancel]);
  return { run, cancel };
}
