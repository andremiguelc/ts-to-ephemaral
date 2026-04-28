import ts from "typescript";
import { compileSnippet } from "../discovery/harness.js";

export function firstReturnExpression(code: string): ts.Expression {
  const { sourceFile } = compileSnippet(code);
  let found: ts.Expression | null = null;
  function visit(n: ts.Node) {
    if (found) return;
    if (ts.isReturnStatement(n) && n.expression) {
      found = n.expression;
      return;
    }
    ts.forEachChild(n, visit);
  }
  visit(sourceFile);
  if (!found) throw new Error("no return expression in snippet");
  return found;
}

export function expressionInsideFirstObjectLiteral(
  code: string,
  fieldName: string,
): ts.Expression {
  const { sourceFile } = compileSnippet(code);
  let found: ts.Expression | null = null;
  function visit(n: ts.Node) {
    if (found) return;
    if (ts.isObjectLiteralExpression(n)) {
      for (const prop of n.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === fieldName
        ) {
          found = prop.initializer;
          return;
        }
        if (
          ts.isShorthandPropertyAssignment(prop) &&
          prop.name.text === fieldName
        ) {
          found = prop.name;
          return;
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sourceFile);
  if (!found) throw new Error(`no object-literal field '${fieldName}' in snippet`);
  return found;
}
