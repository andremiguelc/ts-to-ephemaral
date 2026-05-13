#!/usr/bin/env npx tsx

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

import { readAralFile } from "./aral-reader.js";
import { discoverSites } from "./discovery/index.js";
import { gate, type SiteGateResult } from "./subset-gate.js";
import { emitAralFn } from "./ir-emit.js";
import { emit } from "./diagnostics/emit.js";
import type { AralFn, Diagnostic } from "./types.js";

interface ParsedArgs {
  aralFile: string;
  tsconfigPath: string;
  outDir: string;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  let aralFile: string | undefined;
  let tsconfigPath: string | undefined;
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tsconfig") {
      tsconfigPath = argv[++i];
    } else if (a === "--out") {
      outDir = argv[++i];
    } else if (a.endsWith(".aral")) {
      aralFile = a;
    }
  }
  if (!aralFile || !tsconfigPath) return null;
  return {
    aralFile,
    tsconfigPath,
    outDir: outDir ?? join(process.cwd(), ".ephemaral", "parsed"),
  };
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

const SKIP_DIRS = new Set(["lib", "src", "utils", "helpers", "services", "api"]);

function makeShortPath(filePath: string): string {
  const parts = filePath.replace(/\.tsx?$/, "").split("/");
  const fileName = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0; i--) {
    if (!SKIP_DIRS.has(parts[i])) {
      return `${parts[i]}-${fileName}`;
    }
  }
  return fileName;
}

function hashId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function siteFileName(filePath: string, line: number, fields: string[]): string {
  const shortFile = makeShortPath(filePath);
  const fieldTag = fields.length === 1 ? fields[0] : `${fields.length}fields`;
  const hash = hashId(`${filePath}:${line}:${fieldTag}`);
  return `${shortFile}-${hash}-${fieldTag}.aral-fn.json`;
}

function writeAralFn(
  outDir: string,
  typeName: string,
  filePath: string,
  line: number,
  fn: AralFn,
): string {
  const dir = join(outDir, typeName);
  mkdirSync(dir, { recursive: true });
  const fields = fn.assigns.map((a) => a.fieldName);
  const path = resolve(dir, siteFileName(filePath, line, fields));
  writeFileSync(path, JSON.stringify(fn, null, 2) + "\n");
  return path;
}

const args = parseArgs(process.argv.slice(2));
if (!args) {
  process.stderr.write(
    "usage: extract <file.aral> --tsconfig <path/to/tsconfig.json> [--out <dir>]\n",
  );
  process.exit(1);
}

const target = readAralFile(readFileSync(args.aralFile, "utf-8"));
const program = createProgram(args.tsconfigPath);
const checker = program.getTypeChecker();
const result = discoverSites(target, program);

const diagnostics: Diagnostic[] = [...result.diagnostics];
const accepted: Array<{ result: SiteGateResult; aralFn: AralFn; outPath: string }> = [];

for (const site of result.sites) {
  const gated = gate(site, checker);
  for (const t of gated.targets) {
    if (t.kind === "rejected") diagnostics.push(t.diagnostic);
  }
  diagnostics.push(...gated.warnings);
  const aralFn = emitAralFn(gated);
  if (aralFn) {
    const outPath = writeAralFn(
      args.outDir,
      gated.site.targetType.name,
      gated.site.filePath,
      gated.site.line,
      aralFn,
    );
    accepted.push({ result: gated, aralFn, outPath });
  }
}

diagnostics.sort(compareDiagnostic);
for (const d of diagnostics) {
  process.stdout.write(emit(d) + "\n");
}
for (const a of accepted) {
  const fields = a.aralFn.assigns.map((s) => s.fieldName).join(", ");
  process.stdout.write(
    `${a.result.site.filePath}:${a.result.site.line} [parsed] ` +
      `${a.aralFn.inputType}.${fields} → ${a.outPath}\n`,
  );
}
