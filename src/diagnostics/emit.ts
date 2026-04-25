import type { DiagnosticLabel } from "./labels.js";
import { CATALOG, type CatalogEntry } from "./catalog.js";

export function emit(label: DiagnosticLabel, reason: string): string {
  const entry: CatalogEntry = CATALOG[label];
  return `[${label}] ${entry}\n  ${reason}`;
}
