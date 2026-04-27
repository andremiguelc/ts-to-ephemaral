import ts from "typescript";
import type { ResolvedSignature } from "../types.js";

export function findEnclosingFunction(
  node: ts.Node,
): ts.SignatureDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isConstructorDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

export function resolveSignature(
  fn: ts.SignatureDeclaration,
  checker: ts.TypeChecker,
): ResolvedSignature {
  const parameters: ResolvedSignature["parameters"] = [];
  for (const param of fn.parameters) {
    if (!ts.isIdentifier(param.name)) continue;
    const paramType = checker.getTypeAtLocation(param);
    parameters.push({
      name: param.name.text,
      type: checker.typeToString(paramType),
    });
  }

  const signature = checker.getSignatureFromDeclaration(fn);
  const returnType = signature
    ? checker.typeToString(checker.getReturnTypeOfSignature(signature))
    : "unknown";

  return { parameters, returnType };
}
