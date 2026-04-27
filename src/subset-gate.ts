import type { Diagnostic, DiscoveredSite } from "./types.js";

export interface Rejected {
  kind: "rejected";
  diagnostic: Diagnostic;
}

export type GateResult = Rejected;

export function gate(site: DiscoveredSite): GateResult {
  const fields = site.targets.map((t) => t.fieldName).join(", ");
  return {
    kind: "rejected",
    diagnostic: {
      label: "not-yet-admitted",
      reason:
        `assignment site for ${site.targetType.name} ` +
        `(field${site.targets.length === 1 ? "" : "s"}: ${fields})`,
      filePath: site.filePath,
      line: site.line,
    },
  };
}
