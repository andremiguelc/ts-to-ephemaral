import type { DiagnosticLabel } from "./labels.js";

export type CatalogEntry = string;

export const CATALOG: Record<DiagnosticLabel, CatalogEntry> = {
  "not-yet-admitted":
    "The assignment site is visible to the parser, but no expression construct is " +
    "currently admitted that can translate the right-hand side. The site is " +
    "labelled rather than silently dropped so every assignment in the codebase is " +
    "accounted for.",
  "target-type-unresolvable":
    "The target type's alias chain terminates in a shape the TypeScript checker " +
    "cannot describe structurally. Replace the alias with an explicit interface or " +
    "a plain type alias whose members the checker can list directly.",
};
