import ts from "typescript";

export interface SiteCandidate {
  literal: ts.ObjectLiteralExpression;
  contextualType: ts.Type;
  sourceFile: ts.SourceFile;
}

export function findSiteCandidates(
  program: ts.Program,
  targetTypeName: string,
): SiteCandidate[] {
  const checker = program.getTypeChecker();
  const candidates: SiteCandidate[] = [];
  const target = targetTypeName.toLowerCase();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes("node_modules")) continue;
    visit(sourceFile);
  }

  return candidates;

  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node)) {
      const contextualType = checker.getContextualType(node);
      if (contextualType && typeMatchesByName(contextualType, target)) {
        candidates.push({
          literal: node,
          contextualType,
          sourceFile: node.getSourceFile(),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
}

function typeMatchesByName(type: ts.Type, target: string): boolean {
  const alias = type.aliasSymbol?.getName().toLowerCase();
  if (alias === target) return true;

  const direct = type.getSymbol()?.getName().toLowerCase();
  if (direct === target) return true;

  if (type.isUnionOrIntersection()) {
    return type.types.some((t) => typeMatchesByName(t, target));
  }

  return false;
}
