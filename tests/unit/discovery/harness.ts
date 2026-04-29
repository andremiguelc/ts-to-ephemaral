import ts from "typescript";
import type { AralTarget } from "../../../src/aral-reader.js";
import { discoverSites, type DiscoveryResult } from "../../../src/discovery/index.js";

const VIRTUAL_ROOT = "/virtual";

export interface CompileResult {
  program: ts.Program;
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
}

export function compileSnippet(code: string, name = "snippet.ts"): CompileResult {
  const path = `${VIRTUAL_ROOT}/${name}`;
  const files = new Map<string, string>([[path, code]]);

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  };

  const realHost = ts.createCompilerHost(compilerOptions, true);
  const host: ts.CompilerHost = {
    ...realHost,
    getSourceFile: (fileName, languageVersion, onError, shouldCreate) => {
      if (files.has(fileName)) {
        return ts.createSourceFile(
          fileName,
          files.get(fileName)!,
          languageVersion,
          true,
        );
      }
      return realHost.getSourceFile(fileName, languageVersion, onError, shouldCreate);
    },
    fileExists: (fileName) => files.has(fileName) || realHost.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? realHost.readFile(fileName),
    writeFile: () => {},
    getCurrentDirectory: () => VIRTUAL_ROOT,
  };

  const program = ts.createProgram([path], compilerOptions, host);
  const sourceFile = program.getSourceFile(path);
  if (!sourceFile) throw new Error("compileSnippet: virtual source file not found");
  return { program, sourceFile, checker: program.getTypeChecker() };
}

export function makeTarget(
  typeName: string,
  fieldNames: string[],
  collectionNames: string[] = [],
): AralTarget {
  return {
    rootPrefix: typeName.toLowerCase(),
    typeName,
    fieldNames,
    collectionNames,
    collectionItemFields: new Map(),
  };
}

export function discover(
  code: string,
  typeName: string,
  fieldNames: string[],
): DiscoveryResult & { checker: ts.TypeChecker } {
  const { program } = compileSnippet(code);
  const checker = program.getTypeChecker();
  return { ...discoverSites(makeTarget(typeName, fieldNames), program), checker };
}
