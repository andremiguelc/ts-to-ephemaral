// Lifted from cal.com/packages/lib/ssrfProtection.ts (validateUrlCore).
// Multiple `return { ... }` literals against a named interface — the bread-and-butter
// shape this slice needs to recognize.

export interface SSRFValidationResult {
  isValid: boolean;
  error?: string;
}

const ERRORS = {
  INVALID_URL: "Invalid URL format",
  NON_IMAGE_DATA_URL: "Non-image data URL",
} as const;

export function validateUrl(urlString: string): SSRFValidationResult {
  if (urlString.startsWith("data:image/")) {
    return { isValid: true };
  }
  if (urlString.startsWith("data:")) {
    return { isValid: false, error: ERRORS.NON_IMAGE_DATA_URL };
  }
  try {
    new URL(urlString);
  } catch {
    return { isValid: false, error: ERRORS.INVALID_URL };
  }
  return { isValid: true };
}
