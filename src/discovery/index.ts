import ts from "typescript";
import type { AralTarget } from "../aral-reader.js";
import type { Diagnostic, DiscoveredSite, SiteTarget } from "../types.js";
import { suggestionFor } from "../diagnostics/catalog.js";
import { findSiteCandidates } from "./find-sites.js";
import { resolveTargetSymbols } from "./resolve-target-symbols.js";
import { resolveTargetType } from "./resolve-target-type.js";
import { findEnclosingFunction, resolveSignature } from "./resolve-signature.js";

export interface DiscoveryResult {
  sites: DiscoveredSite[];
  diagnostics: Diagnostic[];
}

export function discoverSites(
  target: AralTarget,
  program: ts.Program,
): DiscoveryResult {
  const checker = program.getTypeChecker();
  const declaredFields = new Set(target.fieldNames);
  const sites: DiscoveredSite[] = [];
  const diagnostics: Diagnostic[] = [];

  const targetSymbols = resolveTargetSymbols(target.typeName, program);
  if (targetSymbols.size === 0) {
    const label = "target-type-not-declared" as const;
    const suggestion = suggestionFor(label, target.typeName);
    diagnostics.push({
      label,
      message: `No interface or type alias named ${target.typeName} is declared in the codebase.`,
      ...(suggestion ? { suggestion } : {}),
    });
    return { sites, diagnostics };
  }

  const canonicalName = [...targetSymbols][0].getName();
  const candidates = findSiteCandidates(program, targetSymbols);

  for (const candidate of candidates) {
    const { literal, matchedType, sourceFile } = candidate;
    const filePath = sourceFile.fileName;
    const line = sourceFile.getLineAndCharacterOfPosition(literal.getStart()).line + 1;

    const resolved = resolveTargetType(matchedType, checker, literal);
    if (resolved.kind === "unresolvable") {
      const label = "target-type-not-readable" as const;
      const suggestion = suggestionFor(label, canonicalName);
      diagnostics.push({
        label,
        message: `${canonicalName} — ${resolved.reason}`,
        ...(suggestion ? { suggestion } : {}),
        filePath,
        line,
      });
      continue;
    }

    const targets = collectTargets(literal, declaredFields);
    if (targets.length === 0) continue;

    const enclosing = findEnclosingFunction(literal);
    const signature = enclosing
      ? resolveSignature(enclosing, checker)
      : { parameters: [], returnType: "unknown" };

    sites.push({
      filePath,
      line,
      sourceFile,
      targetType: { ...resolved.type, name: canonicalName },
      signature,
      targets,
    });
  }

  return { sites, diagnostics };
}

function collectTargets(
  literal: ts.ObjectLiteralExpression,
  declaredFields: Set<string>,
): SiteTarget[] {
  const targets: SiteTarget[] = [];
  for (const prop of literal.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const name = prop.name.text;
      if (declaredFields.has(name)) {
        targets.push({ fieldName: name, expression: prop.initializer });
      }
      continue;
    }
    if (ts.isShorthandPropertyAssignment(prop)) {
      const name = prop.name.text;
      if (declaredFields.has(name)) {
        targets.push({ fieldName: name, expression: prop.name });
      }
    }
  }
  return targets;
}
