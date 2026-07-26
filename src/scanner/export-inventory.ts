/**
 * Enumeration of a source file's exported declarations and whether each already
 * carries a TSDoc comment.
 *
 * @remarks
 * `scaffold` needs three facts per export: where to insert a stub, what shape the
 * export is (so the right template applies), and whether a doc comment is already
 * present. All three come from the TypeScript compiler API rather than regular
 * expressions, so `export` keywords inside strings, template literals, or nested
 * scopes are never mistaken for real declarations.
 *
 * Re-export forms (`export { x } from "./x"`, `export * from "./x"`) are
 * deliberately skipped: the symbol is documented at its definition site, so a
 * stub here would duplicate the docs and drift.
 *
 * @since 0.1.0
 */

import * as ts from "typescript";

/**
 * The shape of an exported declaration, used to select a scaffold template.
 */
export type ExportKind =
  | "react-component"
  | "server-action"
  | "hook"
  | "interface"
  | "type-alias"
  | "function"
  | "variable"
  | "class"
  | "enum";

/**
 * A single parameter of an exported function-like declaration.
 */
export interface ExportParameter {
  /** The parameter name, or a synthesized name for a destructured binding. */
  readonly name: string;
  /** Whether the parameter is optional or has a default. */
  readonly isOptional: boolean;
}

/**
 * An exported declaration discovered in a source file.
 */
export interface ExportedDeclaration {
  /** The exported symbol name (`"default"` for an anonymous default export). */
  readonly name: string;
  /**
   * Every name the declaration exports. Longer than one entry only for a
   * variable statement that binds several names (`export const A = 1, B = 2;`
   * or `export const { a, b } = source;`), which has a single comment position
   * and is therefore documented as one unit.
   */
  readonly names: readonly string[];
  /** The declaration shape, used to pick a template. */
  readonly kind: ExportKind;
  /** Whether a `/** *\/` doc comment is already attached. */
  readonly hasDocComment: boolean;
  /** Offset at which a doc comment for this declaration should be inserted. */
  readonly insertPos: number;
  /** Indentation (leading whitespace) of the declaration's line. */
  readonly indent: string;
  /**
   * Whether the declaration is the first thing on its line. When `false`
   * another statement precedes it on the same line, so a stub must open on a
   * fresh line: TypeScript treats a comment that starts on the same line as
   * preceding code as a *trailing* comment of that earlier statement, which
   * would leave this declaration looking undocumented.
   */
  readonly ownsLine: boolean;
  /** 1-based line number of the declaration, for reporting. */
  readonly line: number;
  /** Parameters, when the declaration is function-like. */
  readonly parameters: readonly ExportParameter[];
  /** Type-parameter names, when the declaration is generic. */
  readonly typeParameters: readonly string[];
  /** Whether the declaration returns a value (drives whether to emit `@returns`). */
  readonly hasReturnValue: boolean;
}

const SERVER_ACTION_PARAMS = ["prevState", "formData"] as const;

/**
 * Tests whether a node carries the `export` modifier.
 *
 * @param node - The declaration to inspect.
 * @returns `true` when the declaration is exported.
 */
function isExported(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }
  const modifiers = ts.getModifiers(node) ?? [];
  return modifiers.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

/**
 * Tests whether a name follows the React hook convention (`useX`).
 *
 * @param name - The exported symbol name.
 * @returns `true` for a name like `useHash` but not `user` or `use`.
 */
function isHookName(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

/**
 * Tests whether a name follows the React component convention (PascalCase).
 *
 * @param name - The exported symbol name.
 * @returns `true` when the name starts with an uppercase letter.
 */
function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * Reports whether a function-like declaration returns JSX.
 *
 * @remarks
 * Only a syntactic check — the return type annotation or a returned JSX
 * expression. A component whose JSX is produced indirectly is still caught by
 * the PascalCase naming convention.
 *
 * The body is walked whether it is a block or a bare expression, so the
 * concise arrow form (`const Hero = () =&gt; &lt;div /&gt;`) is recognized as
 * readily as a block that returns JSX.
 *
 * @param node - The function-like declaration.
 * @returns `true` when JSX is returned or the return type names a JSX element.
 */
function returnsJsx(node: ts.SignatureDeclaration): boolean {
  const typeText = node.type ? node.type.getText() : "";
  if (/\b(?:JSX\.Element|ReactElement|ReactNode)\b/.test(typeText)) {
    return true;
  }

  const body = "body" in node ? node.body : undefined;
  if (!body) {
    return false;
  }

  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      found = true;
      return;
    }
    child.forEachChild(visit);
  };
  visit(body);
  return found;
}

/**
 * Extracts the parameter names of a function-like declaration.
 *
 * @remarks
 * A destructured binding pattern has no name of its own; TSDoc documents it via
 * the conventional `props` / `options` placeholder rather than by inventing one
 * name per destructured field.
 *
 * @param node - The function-like declaration.
 * @returns One entry per declared parameter, in source order.
 */
function readParameters(
  node: ts.SignatureDeclaration,
): readonly ExportParameter[] {
  return node.parameters.map((parameter, index) => {
    const isOptional =
      parameter.questionToken !== undefined ||
      parameter.initializer !== undefined;

    if (ts.isIdentifier(parameter.name)) {
      return { name: parameter.name.text, isOptional };
    }

    // Destructured binding: `{ title, href }: Props`. Name it after the type
    // when it looks like a props object, else fall back to a positional label.
    const typeText = parameter.type?.getText() ?? "";
    const name = /Props$/.test(typeText)
      ? "props"
      : index === 0
        ? "options"
        : `arg${String(index)}`;
    return { name, isOptional };
  });
}

/**
 * Reports whether a function-like declaration produces a value worth a
 * `@returns` tag.
 *
 * @param node - The function-like declaration.
 * @returns `false` when the return type is explicitly `void`, `never`, or
 * `Promise<void>`; `true` otherwise.
 */
function hasReturnValue(node: ts.SignatureDeclaration): boolean {
  if (!node.type) {
    return true;
  }
  const typeText = node.type.getText().replace(/\s/g, "");
  return !(
    typeText === "void" ||
    typeText === "never" ||
    typeText === "Promise<void>"
  );
}

/**
 * Classifies a function-like export into the template that best fits it.
 *
 * @param name - The exported symbol name.
 * @param node - The function-like declaration.
 * @param parameters - The already-extracted parameters.
 * @returns The matching {@link ExportKind}.
 */
function classifyFunction(
  name: string,
  node: ts.SignatureDeclaration,
  parameters: readonly ExportParameter[],
): ExportKind {
  if (isHookName(name)) {
    return "hook";
  }
  // A Server Action's `(prevState, formData)` signature is the strongest signal
  // and is checked before the PascalCase component heuristic, since an action
  // may also be PascalCase-adjacent in name.
  const names = parameters.map((parameter) => parameter.name);
  if (
    names.length >= SERVER_ACTION_PARAMS.length &&
    SERVER_ACTION_PARAMS.every((expected, index) => names[index] === expected)
  ) {
    return "server-action";
  }
  if (isComponentName(name) && returnsJsx(node)) {
    return "react-component";
  }
  return "function";
}

/**
 * Reports whether a declaration already has a leading `/** *\/` doc comment.
 *
 * @param sourceText - The full source file contents.
 * @param node - The declaration to inspect.
 * @returns `true` when a JSDoc-style comment precedes the declaration.
 */
function hasLeadingDocComment(sourceText: string, node: ts.Node): boolean {
  const ranges = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];
  return ranges.some((range) => {
    const text = sourceText.slice(range.pos, range.end);
    return (
      range.kind === ts.SyntaxKind.MultiLineCommentTrivia &&
      text.startsWith("/**") &&
      text !== "/**/"
    );
  });
}

/**
 * Computes where a doc comment for a declaration must be inserted, and with what
 * indentation.
 *
 * @remarks
 * The insertion point is the start of the declaration's own line — not
 * `node.getStart()` — so the stub lands above any `export` keyword and aligns
 * with the code it documents.
 *
 * Positions come from the source file's line map (a binary search over
 * precomputed line starts) rather than from slicing and splitting the source
 * text, which would cost O(n) time and memory per declaration and make a file
 * with many exports quadratic.
 *
 * When another statement shares the line (`const a = 1; export const b = 2;`),
 * inserting at the line start would attach the comment to that earlier
 * statement instead. In that case the stub is anchored at the declaration
 * itself, which keeps the documentation on the symbol it describes.
 *
 * @param sourceFile - The parsed source file, used for its line map.
 * @param node - The declaration to document.
 * @returns The insertion offset, the line's indentation, and its 1-based line number.
 */
function locateInsertion(
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { insertPos: number; indent: string; line: number; ownsLine: boolean } {
  const start = node.getStart(sourceFile, /* includeJsDocComment */ false);
  const { line } = sourceFile.getLineAndCharacterOfPosition(start);
  const lineStart = sourceFile.getPositionOfLineAndCharacter(line, 0);
  const prefix = sourceFile.text.slice(lineStart, start);

  // Only leading whitespace may separate the line start from the declaration;
  // anything else means the line already holds other code. The line's own
  // indentation is still what the stub must align to, so it is reported either
  // way.
  const indent = /^[ \t]*/.exec(prefix)?.[0] ?? "";
  if (!/^[ \t]*$/.test(prefix)) {
    return { insertPos: start, indent, line: line + 1, ownsLine: false };
  }

  return { insertPos: lineStart, indent, line: line + 1, ownsLine: true };
}

/**
 * Every name bound by a declaration name, flattening destructuring patterns.
 *
 * @param name - The binding name or pattern to walk.
 * @returns The bound identifiers in source order.
 */
function bindingNames(name: ts.BindingName): readonly string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }
  const collected: string[] = [];
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) {
      collected.push(...bindingNames(element.name));
    }
  }
  return collected;
}

/**
 * The documentation-relevant shape of a statement, independent of whether the
 * statement is exported directly or through a later `export { … }` list.
 */
interface DeclarationShape {
  readonly name: string;
  readonly names: readonly string[];
  readonly kind: ExportKind;
  readonly parameters: readonly ExportParameter[];
  readonly typeParameters: readonly string[];
  readonly hasReturnValue: boolean;
}

/**
 * Describes a top-level statement as a documentable declaration.
 *
 * @remarks
 * `only` narrows a multi-binding variable statement to the names that are
 * actually exported. `const A = 1, useHash = () => …; export { useHash };`
 * publishes just `useHash`, so the record must be named and classified after
 * that binding rather than after the first one in the statement.
 *
 * @param statement - The statement to inspect.
 * @param only - When present, restricts the described bindings to these names.
 * @returns Its shape, or `undefined` when the statement is not a declaration
 * that can carry documentation, or when `only` matches none of its bindings.
 */
function describeStatement(
  statement: ts.Statement,
  only?: ReadonlySet<string>,
): DeclarationShape | undefined {
  const base = {
    parameters: [] as readonly ExportParameter[],
    typeParameters: [] as readonly string[],
    hasReturnValue: false,
  };

  const readTypeParameters = (
    node: ts.DeclarationWithTypeParameterChildren,
  ): readonly string[] =>
    (node.typeParameters ?? []).map((parameter) => parameter.name.text);

  if (ts.isFunctionDeclaration(statement)) {
    const name = statement.name?.text ?? "default";
    const parameters = readParameters(statement);
    return {
      name,
      names: [name],
      kind: classifyFunction(name, statement, parameters),
      parameters,
      typeParameters: readTypeParameters(statement),
      hasReturnValue: hasReturnValue(statement),
    };
  }

  if (ts.isInterfaceDeclaration(statement)) {
    // Only the interface header is described. Splitting docs onto each member
    // is a separate structural step (see PLAN.md → Deferred).
    return {
      ...base,
      name: statement.name.text,
      names: [statement.name.text],
      kind: "interface",
      typeParameters: readTypeParameters(statement),
    };
  }

  if (ts.isTypeAliasDeclaration(statement)) {
    return {
      ...base,
      name: statement.name.text,
      names: [statement.name.text],
      kind: "type-alias",
      typeParameters: readTypeParameters(statement),
    };
  }

  if (ts.isClassDeclaration(statement)) {
    const name = statement.name?.text ?? "default";
    return {
      ...base,
      name,
      names: [name],
      kind: "class",
      typeParameters: readTypeParameters(statement),
    };
  }

  if (ts.isEnumDeclaration(statement)) {
    return {
      ...base,
      name: statement.name.text,
      names: [statement.name.text],
      kind: "enum",
    };
  }

  if (ts.isVariableStatement(statement)) {
    // Keep each declarator paired with its names so a narrowed statement can
    // still tell which initializer belongs to the exported binding.
    const declared = statement.declarationList.declarations.map(
      (declaration) => ({
        declaration,
        names: bindingNames(declaration.name),
      }),
    );
    const selected =
      only === undefined
        ? declared
        : declared.filter((entry) =>
            entry.names.some((name) => only.has(name)),
          );

    const names = selected.flatMap((entry) =>
      only === undefined
        ? entry.names
        : entry.names.filter((name) => only.has(name)),
    );
    const primary = names[0];
    if (primary === undefined) {
      return undefined;
    }

    // A single identifier bound to a function expression is function-like; a
    // destructuring binding, or a statement contributing several names, is not.
    const [first] = selected;
    const initializer =
      selected.length === 1 &&
      names.length === 1 &&
      first &&
      ts.isIdentifier(first.declaration.name)
        ? first.declaration.initializer
        : undefined;

    if (
      initializer &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ) {
      const parameters = readParameters(initializer);
      return {
        name: primary,
        names,
        kind: classifyFunction(primary, initializer, parameters),
        parameters,
        typeParameters: readTypeParameters(initializer),
        hasReturnValue: hasReturnValue(initializer),
      };
    }

    return {
      ...base,
      name: primary,
      names,
      kind: isHookName(primary) ? "hook" : "variable",
    };
  }

  return undefined;
}

/**
 * Enumerates every exported declaration in a source file.
 *
 * @remarks
 * Only top-level statements are considered — an export nested inside a namespace
 * or a block is not part of the module's public surface for scaffolding
 * purposes.
 *
 * Three export forms are recognized: a declaration carrying the `export`
 * modifier, a local declaration named by a later `export { … }` list, and a
 * local declaration named by `export default …`. In the latter two cases the
 * stub is attached to the local declaration, which is where the documentation
 * belongs and which keeps a second run idempotent.
 *
 * Re-exports that name another module (`export { x } from …`, `export * from …`)
 * are skipped because the symbol is documented where it is defined; the same
 * applies to an `export { x }` whose `x` is an imported binding rather than a
 * local declaration.
 *
 * @param sourceText - The full source file contents.
 * @param fileName - The file name, used to pick the TS/TSX dialect.
 * @returns The exported declarations in source order.
 */
export function collectExportedDeclarations(
  sourceText: string,
  fileName: string,
): readonly ExportedDeclaration[] {
  const scriptKind = fileName.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKind,
  );

  const results: ExportedDeclaration[] = [];
  const localsByName = new Map<string, ts.Statement>();
  const recorded = new Set<ts.Statement>();

  const record = (statement: ts.Statement, shape: DeclarationShape): void => {
    if (recorded.has(statement)) {
      return;
    }
    recorded.add(statement);
    const { insertPos, indent, line, ownsLine } = locateInsertion(
      sourceFile,
      statement,
    );
    results.push({
      name: shape.name,
      names: shape.names,
      kind: shape.kind,
      hasDocComment: hasLeadingDocComment(sourceText, statement),
      insertPos,
      indent,
      line,
      ownsLine,
      parameters: shape.parameters,
      typeParameters: shape.typeParameters,
      hasReturnValue: shape.hasReturnValue,
    });
  };

  // Pass 1 — declarations carrying the `export` modifier. Everything else that
  // could be documented is indexed by name so a later `export { … }` list or
  // `export default …` can resolve back to it.
  for (const statement of sourceFile.statements) {
    const shape = describeStatement(statement);
    if (shape === undefined) {
      continue;
    }
    if (isExported(statement)) {
      record(statement, shape);
      continue;
    }
    for (const name of shape.names) {
      if (!localsByName.has(name)) {
        localsByName.set(name, statement);
      }
    }
  }

  // Pass 2 — exports expressed as statements over local declarations. Names are
  // accumulated per target statement first, because one statement can bind
  // several names while an export list publishes only some of them; the record
  // must describe exactly the exported subset.
  const exportedNamesByStatement = new Map<ts.Statement, Set<string>>();

  const noteExported = (name: string): void => {
    const target = localsByName.get(name);
    if (target === undefined) {
      return;
    }
    const names = exportedNamesByStatement.get(target);
    if (names === undefined) {
      exportedNamesByStatement.set(target, new Set([name]));
      return;
    }
    names.add(name);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      // `export … from "./x"` re-exports another module: documented there.
      if (statement.moduleSpecifier !== undefined) {
        continue;
      }
      const clause = statement.exportClause;
      if (clause === undefined || !ts.isNamedExports(clause)) {
        continue;
      }
      for (const specifier of clause.elements) {
        // `export { local as public }` documents `local`.
        noteExported((specifier.propertyName ?? specifier.name).text);
      }
      continue;
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      noteExported(statement.expression.text);
    }
  }

  for (const [target, names] of exportedNamesByStatement) {
    const shape = describeStatement(target, names);
    if (shape !== undefined) {
      record(target, shape);
    }
  }

  return results.sort((a, b) => a.insertPos - b.insertPos);
}

/**
 * Filters an inventory down to the declarations that still need documentation.
 *
 * @param declarations - The declarations discovered in a file.
 * @returns Only those without an existing doc comment.
 */
export function undocumentedDeclarations(
  declarations: readonly ExportedDeclaration[],
): readonly ExportedDeclaration[] {
  return declarations.filter((declaration) => !declaration.hasDocComment);
}
