// Multiple `return { ... }` literals targeting a named interface with an
// optional field. Exercises per-site discovery across several early-return
// branches in the same function.

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

const ERRORS = {
  INVALID: "invalid",
  EMPTY: "empty",
} as const;

export function validate(input: string): ValidationResult {
  if (input.startsWith("data:image/")) {
    return { isValid: true };
  }
  if (input.startsWith("data:")) {
    return { isValid: false, error: ERRORS.EMPTY };
  }
  try {
    new URL(input);
  } catch {
    return { isValid: false, error: ERRORS.INVALID };
  }
  return { isValid: true };
}
