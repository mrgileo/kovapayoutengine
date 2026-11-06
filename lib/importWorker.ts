// Runs the CSV import off the main thread so the page stays responsive while a big company loads.
// Same rules as the rest of lib/: relative imports with .ts extensions, no React, no window or document.
import { importData } from "./importer.ts";
import type { ImportFiles } from "./importer.ts";

const ctx = self as unknown as { postMessage(message: unknown): void; onmessage: ((e: { data: ImportFiles }) => void) | null };

ctx.onmessage = (e) => {
  const result = importData(e.data, (done, total) => ctx.postMessage({ type: "progress", done, total }));
  ctx.postMessage({ type: "result", result });
};
