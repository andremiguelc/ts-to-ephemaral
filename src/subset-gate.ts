import type { Diagnostic, DiscoveredSite } from "./types.js";
import { suggestionFor } from "./diagnostics/catalog.js";

export interface Rejected {
  kind: "rejected";
  diagnostic: Diagnostic;
}

export type GateResult = Rejected;

export function gate(site: DiscoveredSite): GateResult {
  const name = site.targetType.name;
  const fields = site.targets.map((t) => t.fieldName).join(", ");
  const subject =
    site.targets.length === 1
      ? `${name}.${fields}`
      : `${name} at fields ${fields}`;
  const label = "unsupported-expression" as const;
  const suggestion = suggestionFor(label, name);

  return {
    kind: "rejected",
    diagnostic: {
      label,
      message: `${subject} — cannot translate this assignment expression.`,
      ...(suggestion ? { suggestion } : {}),
      filePath: site.filePath,
      line: site.line,
    },
  };
}
