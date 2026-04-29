import ts from "typescript";
import type { CAE } from "./canonical-ast.js";
import type { Diagnostic, DiscoveredSite, SiteTarget } from "./types.js";
import { suggestionFor } from "./diagnostics/catalog.js";
import { normalize, type NormalizeContext } from "./normalize/index.js";

export type TargetResult =
  | { kind: "accepted"; fieldName: string; cae: CAE }
  | { kind: "rejected"; fieldName: string; diagnostic: Diagnostic };

export interface SiteGateResult {
  site: DiscoveredSite;
  targets: TargetResult[];
}

export function gate(
  site: DiscoveredSite,
  checker: ts.TypeChecker,
): SiteGateResult {
  const ctx: NormalizeContext = {
    checker,
    inputType: site.targetType,
    signature: site.signature,
  };
  const targets = site.targets.map((t) => gateTarget(site, ctx, t));
  return { site, targets };
}

function gateTarget(
  site: DiscoveredSite,
  ctx: NormalizeContext,
  target: SiteTarget,
): TargetResult {
  const normalized = normalize(target.expression, ctx);

  if (normalized.kind === "accepted") {
    return { kind: "accepted", fieldName: target.fieldName, cae: normalized.cae };
  }

  const subject = `${site.targetType.name}.${target.fieldName}`;
  const suggestion = suggestionFor(normalized.label, site.targetType.name);
  const diagnostic: Diagnostic = {
    label: normalized.label,
    message: `${subject} — ${normalized.reason}`,
    ...(suggestion ? { suggestion } : {}),
    filePath: site.filePath,
    line: site.line,
  };
  return { kind: "rejected", fieldName: target.fieldName, diagnostic };
}
