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
    if (ts.isIdentifier(param.name)) {
      const paramType = checker.getTypeAtLocation(param);
      parameters.push({
        name: param.name.text,
        type: checker.typeToString(paramType),
      });
      continue;
    }
    if (ts.isObjectBindingPattern(param.name)) {
      for (const element of param.name.elements) {
        if (!ts.isIdentifier(element.name)) continue;
        const elementType = checker.getTypeAtLocation(element);
        parameters.push({
          name: element.name.text,
          type: checker.typeToString(elementType),
        });
      }
    }
  }

  const signature = checker.getSignatureFromDeclaration(fn);
  const returnType = signature
    ? checker.typeToString(checker.getReturnTypeOfSignature(signature))
    : "unknown";

  return { name: resolveFunctionName(fn), parameters, returnType };
}

function resolveFunctionName(fn: ts.SignatureDeclaration): string | null {
  if (
    (ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) &&
    fn.name
  ) {
    return fn.name.text;
  }
  if (
    (ts.isMethodDeclaration(fn) || ts.isGetAccessorDeclaration(fn) || ts.isSetAccessorDeclaration(fn)) &&
    ts.isIdentifier(fn.name)
  ) {
    return fn.name.text;
  }
  if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
    const parent = fn.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
  }
  return null;
}
