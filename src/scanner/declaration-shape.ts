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
  returnsJsx,
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
  /**
   * Whether {@link DeclarationShape.parameters} was read from a callable node.
   *
   * @remarks
   * An empty parameter list is ambiguous on its own. `export function f() {}`
   * declares none; `export const useHash = createHook(defaults);` is classified
   * a hook by its name, but nothing here can see the signature it ends up with.
   * Both arrive as `[]`, and anything comparing documentation against the
   * signature has to tell them apart — reporting `@param initial` as
   * contradicting a signature that was never read is exactly the false alarm
   * that makes a report worth ignoring.
   */
  readonly hasSignature: boolean;
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
    hasSignature: false,
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
      hasSignature: true,
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
        hasSignature: true,
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

/**
 * Describes an `export default <expression>` statement whose expression is
 * function-like.
 *
 * @remarks
 * `export default foo;` names a local declaration and is documented there, and
 * `export default function () {}` is already a function declaration carrying the
 * modifiers. What is left is a default export of an anonymous function or arrow,
 * which has no other home for its documentation, so the statement itself becomes
 * the documentable declaration.
 *
 * The scope stops where the presence rule stops: `tsdoc-require-2/require`
 * reports a missing comment for a default-exported arrow or function expression,
 * but not for other default-exported expressions such as
 * `export default createStore();`, so those are deliberately left alone rather
 * than given a stub nothing asks for.
 *
 * @param statement - The export assignment to inspect.
 * @returns Its shape, or `undefined` when the expression is not function-like.
 */
export function describeDefaultExport(
  statement: ts.ExportAssignment,
): DeclarationShape | undefined {
  const { expression } = statement;
  if (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression)) {
    return undefined;
  }

  const parameters = readParameters(expression);
  return {
    name: "default",
    names: ["default"],
    // The PascalCase convention cannot apply to an anonymous default export, so
    // returning JSX is the only signal that this is a component.
    kind: returnsJsx(expression) ? "react-component" : "function",
    parameters,
    typeParameters: (expression.typeParameters ?? []).map((p) => p.name.text),
    hasReturnValue: hasReturnValue(expression),
    hasSignature: true,
  };
}
