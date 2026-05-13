import type { CAE, Predicate } from "./canonical-ast.js";
import type { AralFn, BoolExpr, Expr } from "./types.js";
import type { SiteGateResult, TargetResult } from "./subset-gate.js";

export function emitAralFn(result: SiteGateResult): AralFn | null {
  const accepted = result.targets.filter(
    (t): t is Extract<TargetResult, { kind: "accepted" }> => t.kind === "accepted",
  );
  if (accepted.length === 0) return null;

  const site = result.site;
  const assignedFields = accepted.map((a) => a.fieldName);
  const caes = accepted.map((a) => a.cae);
  const referencedFields = collectReferencedFields(caes);
  const inputFields = uniq([...assignedFields, ...referencedFields]);
  const params = uniq(collectParamNames(caes));

  // Only ship per-parameter preconditions for params actually present on this site.
  // Asserts on parameters this site doesn't touch would fail validation against `params`.
  const paramPreconditions = buildParamPreconditions(result.paramAsserts, params);

  const out: AralFn = {
    name: synthesizeName(site.signature.name, site.line, assignedFields),
    inputType: site.targetType.name,
    inputFields,
    params,
    assigns: accepted.map((a) => ({
      fieldName: a.fieldName,
      value: caeToExpr(a.cae),
    })),
  };
  if (paramPreconditions.length > 0) {
    out.paramPreconditions = paramPreconditions;
  }
  return out;
}

export function caeToExpr(cae: CAE): Expr {
  switch (cae.kind) {
    case "Lit":
      return { lit: cae.value };
    case "FieldRef":
      return { field: { name: cae.field } };
    case "ParamRef":
      return { field: { name: cae.name } };
    case "Arith":
      return {
        arith: {
          op: cae.op,
          left: caeToExpr(cae.left),
          right: caeToExpr(cae.right),
        },
      };
  }
}

/**
 * Convert a parser-extracted Assert Predicate to a verifier-side BoolExpr
 * precondition.
 *
 * The Predicate is the if-condition that triggers the throw — when it holds,
 * the function aborts. Callers that reach the assignment therefore satisfy
 * its negation. We wrap the Cmp in `not` so the verifier asserts the
 * actually-guaranteed condition rather than the failure shape.
 */
export function predicateToBoolExpr(pred: Predicate): BoolExpr {
  switch (pred.kind) {
    case "Cmp":
      return {
        not: {
          cmp: {
            op: pred.op,
            left: caeToExpr(pred.left),
            right: caeToExpr(pred.right),
          },
        },
      };
  }
}

function buildParamPreconditions(
  paramAsserts: Map<string, Predicate[]>,
  emittedParams: string[],
): Array<{ name: string; predicates: BoolExpr[] }> {
  const out: Array<{ name: string; predicates: BoolExpr[] }> = [];
  for (const name of emittedParams) {
    const preds = paramAsserts.get(name);
    if (!preds || preds.length === 0) continue;
    out.push({ name, predicates: preds.map(predicateToBoolExpr) });
  }
  return out;
}

function collectReferencedFields(caes: CAE[]): string[] {
  const fields: string[] = [];
  for (const cae of caes) walkForFields(cae, fields);
  return fields;
}

function walkForFields(cae: CAE, into: string[]): void {
  switch (cae.kind) {
    case "FieldRef":
      into.push(cae.field);
      return;
    case "Arith":
      walkForFields(cae.left, into);
      walkForFields(cae.right, into);
      return;
    default:
      return;
  }
}

function collectParamNames(caes: CAE[]): string[] {
  const names: string[] = [];
  for (const cae of caes) walkForParams(cae, names);
  return names;
}

function walkForParams(cae: CAE, into: string[]): void {
  switch (cae.kind) {
    case "ParamRef":
      into.push(cae.name);
      return;
    case "Arith":
      walkForParams(cae.left, into);
      walkForParams(cae.right, into);
      return;
    default:
      return;
  }
}

function uniq(items: string[]): string[] {
  return [...new Set(items)];
}

function synthesizeName(
  funcName: string | null,
  line: number,
  fields: string[],
): string {
  const fieldTag = fields.length === 1 ? fields[0] : `${fields.length}fields`;
  if (funcName) return `${funcName}-${fieldTag}`;
  return `anon-l${line}-${fieldTag}`;
}
