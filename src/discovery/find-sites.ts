import ts from "typescript";

export type SiteCandidate =
  | {
      kind: "literal";
      literal: ts.ObjectLiteralExpression;
      matchedType: ts.Type;
      sourceFile: ts.SourceFile;
    }
  | {
      kind: "assignment";
      binaryExpr: ts.BinaryExpression;
      matchedType: ts.Type;
      sourceFile: ts.SourceFile;
    };

export function findSiteCandidates(
  program: ts.Program,
  targetSymbols: Set<ts.Symbol>,
): SiteCandidate[] {
  const checker = program.getTypeChecker();
  const candidates: SiteCandidate[] = [];

  if (targetSymbols.size === 0) return candidates;

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes("node_modules")) continue;
    visit(sourceFile);
  }

  return candidates;

  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node)) {
      const contextualType = checker.getContextualType(node);
      if (contextualType) {
        const matched = findMatchingType(contextualType, targetSymbols);
        if (matched) {
          candidates.push({
            kind: "literal",
            literal: node,
            matchedType: matched,
            sourceFile: node.getSourceFile(),
          });
        }
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left)
    ) {
      const receiverType = checker.getTypeAtLocation(node.left.expression);
      const matched = findMatchingType(receiverType, targetSymbols);
      if (matched) {
        candidates.push({
          kind: "assignment",
          binaryExpr: node,
          matchedType: matched,
          sourceFile: node.getSourceFile(),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
}

function findMatchingType(
  type: ts.Type,
  targets: Set<ts.Symbol>,
): ts.Type | null {
  const sym = type.getSymbol();
  if (sym && targets.has(sym)) return type;

  const alias = type.aliasSymbol;
  if (alias && targets.has(alias)) return type;

  if (type.isUnionOrIntersection()) {
    for (const t of type.types) {
      const m = findMatchingType(t, targets);
      if (m) return m;
    }
  }

  return null;
}
