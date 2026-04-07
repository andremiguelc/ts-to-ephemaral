/**
 * Field finder — uses the TypeScript compiler API to locate every assignment
 * to a target type's fields across a project.
 *
 * Given a type name (e.g., "Payment") and field names (e.g., ["amount", "fee"]),
 * walks every source file in the TS program looking for:
 *   1. Object literal properties: { amount: expr } where the object's type matches
 *   2. Direct property assignments: result.amount = expr
 *   3. ORM/Prisma calls: prisma.model.create/update({ data: { amount: expr } })
 */

import ts from "typescript";

export interface AssignmentSite {
  /** Which field is being assigned */
  fieldName: string;
  /** The expression node being assigned to the field */
  expressionNode: ts.Expression;
  /** Absolute file path */
  filePath: string;
  /** 1-based line number */
  line: number;
  /** The containing function/method name (for labeling) */
  containerName: string;
  /** The full source file (needed by expr-extractor for context) */
  sourceFile: ts.SourceFile;
}

/**
 * Create a TS program from a tsconfig.json path.
 */
export function createProgramFromConfig(tsconfigPath: string): ts.Program {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    const msg = ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n");
    throw new Error(`Failed to read tsconfig: ${msg}`);
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    tsconfigPath.replace(/[/\\][^/\\]+$/, ""), // directory of tsconfig
  );

  if (parsed.errors.length > 0) {
    const msgs = parsed.errors.map((e) =>
      ts.flattenDiagnosticMessageText(e.messageText, "\n")
    );
    throw new Error(`tsconfig errors:\n${msgs.join("\n")}`);
  }

  return ts.createProgram(parsed.fileNames, parsed.options);
}

/**
 * Find all assignment sites for the given type and fields across the program.
 */
export function findAssignmentSites(
  program: ts.Program,
  typeName: string,
  fieldNames: string[],
): AssignmentSite[] {
  const checker = program.getTypeChecker();
  const targetFields = new Set(fieldNames);
  const sites: AssignmentSite[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    // Skip declaration files and node_modules
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes("node_modules")) continue;

    visitNode(sourceFile, sourceFile);
  }

  return sites;

  function visitNode(node: ts.Node, sf: ts.SourceFile) {
    // Pattern 1: Object literal property — { fieldName: expr }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const propName = node.name.text;
      if (targetFields.has(propName)) {
        // Check if the parent object literal's contextual type matches our target
        const objectLiteral = node.parent;
        if (ts.isObjectLiteralExpression(objectLiteral)) {
          if (objectTypeMatches(objectLiteral, typeName, checker)) {
            sites.push({
              fieldName: propName,
              expressionNode: node.initializer,
              filePath: sf.fileName,
              line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
              containerName: findContainerName(node),
              sourceFile: sf,
            });
          }
        }
      }
    }

    // Pattern 2: Direct property assignment — result.fieldName = expr
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left)
    ) {
      const propAccess = node.left;
      const propName = propAccess.name.text;
      if (targetFields.has(propName)) {
        // Check if the object's type matches
        const objType = checker.getTypeAtLocation(propAccess.expression);
        if (typeNameMatches(objType, typeName, checker)) {
          sites.push({
            fieldName: propName,
            expressionNode: node.right,
            filePath: sf.fileName,
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            containerName: findContainerName(node),
            sourceFile: sf,
          });
        }
      }
    }

    // Pattern 3: ORM/Prisma — prisma.model.create/update({ data: { field: expr } })
    if (ts.isCallExpression(node)) {
      const ormSites = extractOrmAssignments(node, typeName, targetFields, sf);
      sites.push(...ormSites);
    }

    ts.forEachChild(node, (child) => visitNode(child, sf));
  }
}

/**
 * Detect ORM/Prisma patterns: prisma.<model>.create/update/upsert({ data: { field: expr } })
 * The model name is matched case-insensitively against the target type name.
 */
function extractOrmAssignments(
  node: ts.CallExpression,
  typeName: string,
  targetFields: Set<string>,
  sf: ts.SourceFile,
): AssignmentSite[] {
  const sites: AssignmentSite[] = [];

  // Check shape: <obj>.<method>(args) where method is create/update/upsert/updateMany
  if (!ts.isPropertyAccessExpression(node.expression)) return sites;
  const method = node.expression.name.text;
  if (!["create", "update", "upsert", "updateMany"].includes(method)) return sites;

  // Check shape: <prismaClient>.<model>.<method>
  const modelAccess = node.expression.expression;
  if (!ts.isPropertyAccessExpression(modelAccess)) return sites;
  const modelName = modelAccess.name.text;

  // Match model name case-insensitively against the target type
  if (modelName.toLowerCase() !== typeName.toLowerCase()) return sites;

  // First argument should be an object literal with a `data` property
  if (node.arguments.length === 0) return sites;
  const firstArg = node.arguments[0];
  if (!ts.isObjectLiteralExpression(firstArg)) return sites;

  // Find the `data` property
  let dataObj: ts.ObjectLiteralExpression | null = null;
  for (const prop of firstArg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === "data" &&
      ts.isObjectLiteralExpression(prop.initializer)
    ) {
      dataObj = prop.initializer;
      break;
    }
  }

  if (!dataObj) return sites;

  // Extract field assignments from the data object
  for (const prop of dataObj.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const fieldName = prop.name.text;
      if (targetFields.has(fieldName)) {
        sites.push({
          fieldName,
          expressionNode: prop.initializer,
          filePath: sf.fileName,
          line: sf.getLineAndCharacterOfPosition(prop.getStart()).line + 1,
          containerName: findContainerName(node),
          sourceFile: sf,
        });
      }
    }
  }

  return sites;
}

/**
 * Check if an object literal's contextual type matches the target type name.
 * Uses the TypeChecker to resolve the expected type from context.
 */
function objectTypeMatches(
  obj: ts.ObjectLiteralExpression,
  typeName: string,
  checker: ts.TypeChecker,
): boolean {
  // Try contextual type first (from return type, variable declaration, etc.)
  const contextualType = checker.getContextualType(obj);
  if (contextualType && typeNameMatches(contextualType, typeName, checker)) {
    return true;
  }

  // Fall back to the resolved type of the expression
  const exprType = checker.getTypeAtLocation(obj);
  return typeNameMatches(exprType, typeName, checker);
}

/**
 * Check if a TS type matches the target type name (case-insensitive).
 * Handles type aliases, interfaces, and structural types.
 */
function typeNameMatches(
  type: ts.Type,
  targetName: string,
  checker: ts.TypeChecker,
): boolean {
  const target = targetName.toLowerCase();

  // Check the type's symbol name
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  if (symbol) {
    const name = symbol.getName().toLowerCase();
    if (name === target) return true;
  }

  // Check the full type string as fallback (handles inline types, intersections)
  const typeStr = checker.typeToString(type).toLowerCase();
  if (typeStr === target) return true;

  // For union/intersection types, check each constituent
  if (type.isUnionOrIntersection()) {
    return type.types.some((t) => typeNameMatches(t, targetName, checker));
  }

  return false;
}

/**
 * Walk up the AST to find the containing function/method/variable name.
 */
function findContainerName(node: ts.Node): string {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      // Check if assigned to a variable
      if (current.parent && ts.isVariableDeclaration(current.parent)) {
        if (ts.isIdentifier(current.parent.name)) {
          return current.parent.name.text;
        }
      }
      // Check if it's a property assignment (e.g., methods: { foo: () => {} })
      if (current.parent && ts.isPropertyAssignment(current.parent)) {
        if (ts.isIdentifier(current.parent.name)) {
          return current.parent.name.text;
        }
      }
    }
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    current = current.parent;
  }
  return "<anonymous>";
}
