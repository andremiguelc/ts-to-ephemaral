import type { Diagnostic } from "../types.js";

export function emit(diagnostic: Diagnostic): string {
  const prefix =
    diagnostic.filePath && diagnostic.line !== undefined
      ? `${diagnostic.filePath}:${diagnostic.line} `
      : "";
  const head = `${prefix}[${diagnostic.label}] ${diagnostic.message}`;
  if (!diagnostic.suggestion) return head;
  const indented = diagnostic.suggestion
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `${head}\n${indented}`;
}
