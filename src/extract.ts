#!/usr/bin/env npx tsx

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import ts from "typescript";

import { readAralFile } from "./aral-reader.js";
import { discoverSites } from "./discovery/index.js";
import { gate } from "./subset-gate.js";
import { emit } from "./diagnostics/emit.js";
import type { Diagnostic } from "./types.js";

interface ParsedArgs {
  aralFile: string;
  tsconfigPath: string;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  let aralFile: string | undefined;
  let tsconfigPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tsconfig") {
      tsconfigPath = argv[++i];
    } else if (a.endsWith(".aral")) {
      aralFile = a;
    }
  }
  if (!aralFile || !tsconfigPath) return null;
  return { aralFile, tsconfigPath };
}

function createProgram(tsconfigPath: string): ts.Program {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    const msg = ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n");
    throw new Error(`failed to read tsconfig: ${msg}`);
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(tsconfigPath),
  );
  if (parsed.errors.length > 0) {
    const msgs = parsed.errors.map((e) =>
      ts.flattenDiagnosticMessageText(e.messageText, "\n"),
    );
    throw new Error(`tsconfig errors:\n${msgs.join("\n")}`);
  }
  return ts.createProgram(parsed.fileNames, parsed.options);
}

function compareDiagnostic(a: Diagnostic, b: Diagnostic): number {
  const aPath = a.filePath ?? "";
  const bPath = b.filePath ?? "";
  if (aPath !== bPath) return aPath.localeCompare(bPath);
  return (a.line ?? 0) - (b.line ?? 0);
}

const args = parseArgs(process.argv.slice(2));
if (!args) {
  process.stderr.write(
    "usage: extract <file.aral> --tsconfig <path/to/tsconfig.json>\n",
  );
  process.exit(1);
}

const target = readAralFile(readFileSync(args.aralFile, "utf-8"));
const program = createProgram(args.tsconfigPath);
const result = discoverSites(target, program);

const all: Diagnostic[] = [...result.diagnostics];
for (const site of result.sites) {
  all.push(gate(site).diagnostic);
}

all.sort(compareDiagnostic);
for (const d of all) {
  process.stdout.write(emit(d) + "\n");
}
