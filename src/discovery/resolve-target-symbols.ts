import ts from "typescript";

export function resolveTargetSymbols(
  targetName: string,
  program: ts.Program,
): Set<ts.Symbol> {
  const checker = program.getTypeChecker();
  const target = targetName.toLowerCase();
  const symbols = new Set<ts.Symbol>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes("node_modules")) continue;

    for (const statement of sourceFile.statements) {
      if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) {
        continue;
      }
      if (statement.name.text.toLowerCase() !== target) continue;

      const declSymbol = checker.getSymbolAtLocation(statement.name);
      if (!declSymbol) continue;

      symbols.add(declSymbol);
      const declType = checker.getDeclaredTypeOfSymbol(declSymbol);
      const underlying = declType.getSymbol() ?? declType.aliasSymbol;
      if (underlying) symbols.add(underlying);
    }
  }

  return symbols;
}
