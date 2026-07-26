/**
 * Description of a top-level statement as a documentable declaration.
 *
 * @remarks
 * Kept separate from the inventory itself so the "what is this statement"
 * question has one home, independent of how a statement comes to be exported
 * (an `export` modifier, an `export { … }` list, or `export default …`).
 *
 * @since 0.1.0
 */

import * as ts from "typescript";

import {
  classifyFunction,
  hasReturnValue,
  isHookName,
  mayHoldFunction,
  readParameters,
  type ExportKind,
  type ExportParameter,
} from "@/scanner/declaration-classifier";

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
export interface DeclarationShape {
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
export function describeStatement(
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
      kind:
        isHookName(primary) && mayHoldFunction(first?.declaration.initializer)
          ? "hook"
          : "variable",
    };
  }

  return undefined;
}
