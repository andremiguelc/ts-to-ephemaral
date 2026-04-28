import ts from "typescript";
import type { ResolvedTargetType } from "../types.js";

export type ResolveTargetTypeResult =
  | { kind: "resolved"; type: ResolvedTargetType }
  | { kind: "unresolvable"; reason: string };

export function resolveTargetType(
  type: ts.Type,
  checker: ts.TypeChecker,
  anchor: ts.Node,
): ResolveTargetTypeResult {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  if (!symbol) {
    return {
      kind: "unresolvable",
      reason: "TypeScript cannot identify this type.",
    };
  }

  const name = symbol.getName();
  const properties = checker.getPropertiesOfType(type);

  if (properties.length === 0) {
    return {
      kind: "unresolvable",
      reason: "TypeScript cannot list this type's members.",
    };
  }

  const fields: Record<string, string> = {};
  for (const propSymbol of properties) {
    const propType = checker.getTypeOfSymbolAtLocation(propSymbol, anchor);
    fields[propSymbol.getName()] = checker.typeToString(propType);
  }

  return {
    kind: "resolved",
    type: { name, fields },
  };
}
