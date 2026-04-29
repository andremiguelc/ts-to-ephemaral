import type { CAE } from "./canonical-ast.js";
import type { AralFn, Expr } from "./types.js";
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

  return {
    name: synthesizeName(site.signature.name, site.line, assignedFields),
    inputType: site.targetType.name,
    inputFields,
    params,
    assigns: accepted.map((a) => ({
      fieldName: a.fieldName,
      value: caeToExpr(a.cae),
    })),
  };
}

export function caeToExpr(cae: CAE): Expr {
  switch (cae.kind) {
    case "Lit":
      return { lit: cae.value };
    case "FieldRef":
      return { field: { name: cae.field } };
    case "ParamRef":
      return { field: { name: cae.name } };
  }
}

function collectReferencedFields(caes: CAE[]): string[] {
  const fields: string[] = [];
  for (const cae of caes) {
    if (cae.kind === "FieldRef") fields.push(cae.field);
  }
  return fields;
}

function collectParamNames(caes: CAE[]): string[] {
  const names: string[] = [];
  for (const cae of caes) {
    if (cae.kind === "ParamRef") names.push(cae.name);
  }
  return names;
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
