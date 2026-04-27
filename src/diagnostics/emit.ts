import { CATALOG, type CatalogEntry } from "./catalog.js";
import type { Diagnostic } from "../types.js";

export function emit(diagnostic: Diagnostic): string {
  const entry: CatalogEntry = CATALOG[diagnostic.label];
  return (
    `${diagnostic.filePath}:${diagnostic.line} [${diagnostic.label}] ${entry}\n` +
    `  ${diagnostic.reason}`
  );
}
