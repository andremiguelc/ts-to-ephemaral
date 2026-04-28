import type { DiagnosticLabel } from "./labels.js";

export type SuggestionBuilder = (declaredName: string) => string;

export const SUGGESTIONS: Record<DiagnosticLabel, SuggestionBuilder | null> = {
  "unsupported-expression": null,
  "target-type-not-readable": (name) =>
    `Replace with \`interface ${name} { ... }\` or \`type ${name} = { ... }\` ` +
    `whose members the checker can read.`,
  "target-type-not-declared": (name) =>
    `Add \`interface ${name} { ... }\` or \`type ${name} = ...\` somewhere ` +
    `the parser can read, matching the .aral root prefix.`,
};

export function suggestionFor(
  label: DiagnosticLabel,
  declaredName: string,
): string | null {
  const build = SUGGESTIONS[label];
  return build ? build(declaredName) : null;
}
