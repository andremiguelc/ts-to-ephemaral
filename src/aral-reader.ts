/**
 * .aral file reader — extracts type and field information from invariant files.
 *
 * Follows the grammar defined in ephemaral/dsl/LANGUAGE.md.
 * This is NOT a full .aral parser — it extracts just the metadata the
 * field finder needs: root type, field names, and collection info.
 */

export interface AralTarget {
  /** Root type prefix from the .aral file (e.g., "payment" from payment.amount) */
  rootPrefix: string;
  /** Capitalized type name for matching TS types (e.g., "Payment") */
  typeName: string;
  /** Scalar field names referenced in invariants */
  fieldNames: string[];
  /** Collection field names (used in sum/each) */
  collectionNames: string[];
  /** Per-collection item field names */
  collectionItemFields: Map<string, string[]>;
}

/**
 * Parse an .aral file and extract the target type/fields for the field finder.
 *
 * Grammar (from LANGUAGE.md):
 *   - Lines starting with # are comments
 *   - invariant <name>: declares an invariant
 *   - <root>.<field> references a typed field
 *   - sum(<root>.<collection>, <per-item-expr>) aggregates over a collection
 *   - each(<root>.<collection>, <per-item-predicate>) quantifies over a collection
 *   - Arithmetic, comparisons, and boolean connectives (and/or) in expressions
 */
export function readAralFile(content: string): AralTarget {
  const fieldNames = new Set<string>();
  const collectionNames = new Set<string>();
  const collectionItemFields = new Map<string, string[]>();

  // Clean: strip comments and blank lines
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  // Find root prefix from the first root.field reference
  // Skip "invariant <name>:" lines — look for expression lines
  let rootPrefix = "";
  for (const line of lines) {
    if (line.startsWith("invariant ")) continue;
    const match = /(\w+)\.(\w+)/.exec(line);
    if (match) {
      rootPrefix = match[1];
      break;
    }
  }

  if (!rootPrefix) {
    return {
      rootPrefix: "",
      typeName: "",
      fieldNames: [],
      collectionNames: [],
      collectionItemFields: new Map(),
    };
  }

  // Capitalize root prefix for TS type matching
  // "payment" → "Payment", "bookingLimit" → "BookingLimit"
  const typeName = rootPrefix.charAt(0).toUpperCase() + rootPrefix.slice(1);

  // Reserved words that appear in expressions but aren't field names
  const reserved = new Set([
    "and", "or", "not", "sum", "each", "invariant", "if", "exists",
  ]);

  for (const line of lines) {
    if (line.startsWith("invariant ")) continue;

    // Match sum(root.collection, body) and each(root.collection, body)
    const collPattern = new RegExp(
      `(?:sum|each)\\s*\\(\\s*${rootPrefix}\\.(\\w+)\\s*,\\s*(.+?)\\s*\\)`,
      "g"
    );
    let collMatch;
    while ((collMatch = collPattern.exec(line)) !== null) {
      const collName = collMatch[1];
      const body = collMatch[2];
      collectionNames.add(collName);

      // Extract item field names from the body
      // Item fields are bare identifiers (no root. prefix) that aren't reserved/numeric
      const itemFields = new Set<string>();
      const tokenPattern = /\b([a-zA-Z_]\w*)\b/g;
      let tokenMatch;
      while ((tokenMatch = tokenPattern.exec(body)) !== null) {
        const token = tokenMatch[1];
        if (!reserved.has(token) && !/^\d+$/.test(token)) {
          itemFields.add(token);
        }
      }
      collectionItemFields.set(collName, Array.from(itemFields));
    }

    // Match root.field references (not inside sum/each collection position)
    const fieldPattern = new RegExp(`${rootPrefix}\\.(\\w+)`, "g");
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(line)) !== null) {
      const field = fieldMatch[1];
      // If it's a collection name (used in sum/each), don't add as scalar field
      if (!collectionNames.has(field)) {
        fieldNames.add(field);
      }
    }
  }

  return {
    rootPrefix,
    typeName,
    fieldNames: Array.from(fieldNames),
    collectionNames: Array.from(collectionNames),
    collectionItemFields,
  };
}
