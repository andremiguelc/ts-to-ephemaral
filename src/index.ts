#!/usr/bin/env npx tsx
/**
 * ts-to-aral-fn — Parse TypeScript functions into Aral-fn JSON
 *
 * Usage:
 *   npx tsx src/index.ts <file.ts>
 *   npx tsx src/index.ts <file.ts> > output.aral-fn.json
 */

import { readFileSync } from "fs";
import { parseTS } from "./parser.js";

const args = process.argv.slice(2);

if (args.length !== 1) {
  console.error("Usage: ts-to-aral-fn <file.ts>");
  console.error("Outputs Aral-fn JSON to stdout.");
  process.exit(1);
}

const filePath = args[0];

try {
  const source = readFileSync(filePath, "utf-8");
  const result = parseTS(source);
  console.log(JSON.stringify(result, null, 2));
} catch (e: any) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
