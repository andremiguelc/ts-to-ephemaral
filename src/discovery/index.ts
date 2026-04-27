import ts from "typescript";
import type { AralTarget } from "../aral-reader.js";
import type { Diagnostic, DiscoveredSite, SiteTarget } from "../types.js";
import { findSiteCandidates } from "./find-sites.js";
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

  const candidates = findSiteCandidates(program, target.typeName);

  for (const candidate of candidates) {
    const { literal, contextualType, sourceFile } = candidate;
    const filePath = sourceFile.fileName;
    const line = sourceFile.getLineAndCharacterOfPosition(literal.getStart()).line + 1;

    const resolved = resolveTargetType(contextualType, checker, literal);
    if (resolved.kind === "unresolvable") {
      diagnostics.push({
        label: "target-type-unresolvable",
        reason: resolved.reason,
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
      targetType: resolved.type,
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
