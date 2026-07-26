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
  /** The declaration shape, used to pick a template. */
  readonly kind: ExportKind;
  /** Whether a `/** *\/` doc comment is already attached. */
  readonly hasDocComment: boolean;
  /** Offset at which a doc comment for this declaration should be inserted. */
  readonly insertPos: number;
  /** Indentation (leading whitespace) of the declaration's line. */
  readonly indent: string;
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
 * @param node - The function-like declaration.
 * @returns `true` when JSX is returned or the return type names a JSX element.
 */
function returnsJsx(node: ts.SignatureDeclaration): boolean {
  const typeText = node.type ? node.type.getText() : "";
  if (/\b(?:JSX\.Element|ReactElement|ReactNode)\b/.test(typeText)) {
    return true;
  }

  const body = "body" in node ? node.body : undefined;
  if (!body || !ts.isBlock(body)) {
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
 * with the code it documents. Leading decorators are respected by starting from
 * the node's first token.
 *
 * @param sourceText - The full source file contents.
 * @param node - The declaration to document.
 * @returns The insertion offset, the line's indentation, and its 1-based line number.
 */
function locateInsertion(
  sourceText: string,
  node: ts.Node,
): { insertPos: number; indent: string; line: number } {
  const start = node.getStart(node.getSourceFile(), /* includeJsDocComment */ false);
  const lineStart = sourceText.lastIndexOf("\n", start - 1) + 1;
  const indent = /^[ \t]*/.exec(sourceText.slice(lineStart, start))?.[0] ?? "";
  const line = sourceText.slice(0, lineStart).split("\n").length;
  return { insertPos: lineStart, indent, line };
}

/**
 * Enumerates every exported declaration in a source file.
 *
 * @remarks
 * Only top-level statements are considered — an export nested inside a namespace
 * or a block is not part of the module's public surface for scaffolding
 * purposes. Re-exports (`export { x } from …`, `export * from …`) are skipped
 * because the symbol is documented where it is defined.
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

  const push = (
    node: ts.Node,
    name: string,
    kind: ExportKind,
    extras: {
      parameters?: readonly ExportParameter[];
      typeParameters?: readonly string[];
      hasReturnValue?: boolean;
    } = {},
  ): void => {
    const { insertPos, indent, line } = locateInsertion(sourceText, node);
    results.push({
      name,
      kind,
      hasDocComment: hasLeadingDocComment(sourceText, node),
      insertPos,
      indent,
      line,
      parameters: extras.parameters ?? [],
      typeParameters: extras.typeParameters ?? [],
      hasReturnValue: extras.hasReturnValue ?? false,
    });
  };

  const readTypeParameters = (
    node: ts.DeclarationWithTypeParameterChildren,
  ): readonly string[] =>
    (node.typeParameters ?? []).map((parameter) => parameter.name.text);

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      const name = statement.name?.text ?? "default";
      const parameters = readParameters(statement);
      push(statement, name, classifyFunction(name, statement, parameters), {
        parameters,
        typeParameters: readTypeParameters(statement),
        hasReturnValue: hasReturnValue(statement),
      });
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      // Only the interface header is scaffolded. Splitting docs onto each member
      // is a separate structural step (see PLAN.md → Deferred).
      push(statement, statement.name.text, "interface", {
        typeParameters: readTypeParameters(statement),
      });
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      push(statement, statement.name.text, "type-alias", {
        typeParameters: readTypeParameters(statement),
      });
      continue;
    }

    if (ts.isClassDeclaration(statement)) {
      push(statement, statement.name?.text ?? "default", "class", {
        typeParameters: readTypeParameters(statement),
      });
      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      push(statement, statement.name.text, "enum");
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      // A variable statement can declare several bindings, but only the
      // statement itself carries the `export` keyword and the comment position.
      // Document it under the first named binding.
      const [declaration] = statement.declarationList.declarations;
      if (!declaration || !ts.isIdentifier(declaration.name)) {
        continue;
      }
      const name = declaration.name.text;
      const initializer = declaration.initializer;

      if (
        initializer &&
        (ts.isArrowFunction(initializer) ||
          ts.isFunctionExpression(initializer))
      ) {
        const parameters = readParameters(initializer);
        push(statement, name, classifyFunction(name, initializer, parameters), {
          parameters,
          typeParameters: readTypeParameters(initializer),
          hasReturnValue: hasReturnValue(initializer),
        });
        continue;
      }

      push(statement, name, isHookName(name) ? "hook" : "variable");
      continue;
    }
  }

  return results;
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
