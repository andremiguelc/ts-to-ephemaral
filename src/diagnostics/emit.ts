import type { Diagnostic } from "../types.js";

export function emit(diagnostic: Diagnostic): string {
  const prefix =
    diagnostic.filePath && diagnostic.line !== undefined
      ? `${diagnostic.filePath}:${diagnostic.line} `
      : "";
  const head = `${prefix}[${diagnostic.label}] ${diagnostic.message}`;
  return diagnostic.suggestion ? `${head}\n  ${diagnostic.suggestion}` : head;
}
