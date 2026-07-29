/**
 * Classification of a declaration's documentation-relevant shape: what kind of
 * export it is, what parameters it declares, and whether it returns a value.
 *
 * @remarks
 * Every check here is syntactic. The scanner never type-checks a project, so a
 * component is recognized by returning JSX plus a PascalCase name, a Server
 * Action by its `(prevState, formData)` signature, and a hook by the `useX`
 * convention over a value that could be callable.
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

const FUNCTION_LIKE_KINDS: ReadonlySet<ExportKind> = new Set<ExportKind>([
  "function",
  "hook",
  "server-action",
  "react-component",
]);

/**
 * Reports whether a kind describes something callable.
 *
 * @remarks
 * `@param` and `@returns` only mean anything on a callable, so every command
 * that reasons about those tags — `scaffold` when emitting them, the classifier
 * when checking for them — has to draw this line. Drawing it once keeps them
 * from disagreeing about which exports are supposed to carry them.
 *
 * @param kind - The declaration kind to test.
 * @returns `true` for functions, hooks, Server Actions, and React components.
 */
export function isFunctionLikeKind(kind: ExportKind): boolean {
  return FUNCTION_LIKE_KINDS.has(kind);
}

/**
 * A single parameter of an exported function-like declaration.
 */
export interface ExportParameter {
  /** The parameter name, or a synthesized name for a destructured binding. */
  readonly name: string;
  /** Whether the parameter is optional or has a default. */
  readonly isOptional: boolean;
  /**
   * Whether {@link ExportParameter.name} was invented for a destructuring
   * pattern rather than written in the source.
   *
   * @remarks
   * A synthesized name is good enough to scaffold a `@param` tag, but it is not
   * evidence about what the source actually declares: `({ title, href }: Props)`
   * reports one parameter called `props`, while its documentation may legitimately
   * describe `title` and `href`. Anything that compares documentation against the
   * signature has to know the difference, or it would report accurate docs as
   * contradicting the code.
   */
  readonly isSynthesized: boolean;
}

const SERVER_ACTION_PARAMS = ["prevState", "formData"] as const;

/**
 * Tests whether a node carries the `export` modifier.
 *
 * @param node - The declaration to inspect.
 * @returns `true` when the declaration is exported.
 */
export function isExported(node: ts.Node): boolean {
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
export function isHookName(name: string): boolean {
  return /^use[A-Z]/.test(name);
}

/**
 * Tests whether a name follows the React component convention (PascalCase).
 *
 * @param name - The exported symbol name.
 * @returns `true` when the name starts with an uppercase letter.
 */
export function isComponentName(name: string): boolean {
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
export function returnsJsx(node: ts.SignatureDeclaration): boolean {
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
 * Reports whether a parameter is the `this` type annotation rather than a real
 * parameter.
 *
 * @remarks
 * `function handle(this: HTMLElement, event: Event)` declares one parameter;
 * `this` is a type annotation that callers never pass. TypeScript still models
 * it as a parameter node, so counting it made `scaffold` write
 * `@param this - TODO(tsdoc): describe this.` into real code, and made the
 * classifier report a correct comment as missing it. `this` is reserved, so no
 * real parameter can carry the name.
 *
 * @param parameter - The parameter node to inspect.
 * @returns `true` for the `this` pseudo-parameter.
 */
function isThisParameter(parameter: ts.ParameterDeclaration): boolean {
  return ts.isIdentifier(parameter.name) && parameter.name.text === "this";
}

/**
 * Extracts the parameter names of a function-like declaration.
 *
 * @remarks
 * A destructured binding pattern has no name of its own; TSDoc documents it via
 * the conventional `props` / `options` placeholder rather than by inventing one
 * name per destructured field.
 *
 * The `this` annotation is dropped before anything else, so it neither appears
 * as a parameter nor shifts the positional labels of the ones that follow.
 *
 * @param node - The function-like declaration.
 * @returns One entry per declared parameter, in source order.
 */
export function readParameters(
  node: ts.SignatureDeclaration,
): readonly ExportParameter[] {
  return node.parameters
    .filter((parameter) => !isThisParameter(parameter))
    .map((parameter, index) => {
      const isOptional =
        parameter.questionToken !== undefined ||
        parameter.initializer !== undefined;

      if (ts.isIdentifier(parameter.name)) {
        return { name: parameter.name.text, isOptional, isSynthesized: false };
      }

      // Destructured binding: `{ title, href }: Props`. Name it after the type
      // when it looks like a props object, else fall back to a positional label.
      const typeText = parameter.type?.getText() ?? "";
      const name = /Props$/.test(typeText)
        ? "props"
        : index === 0
          ? "options"
          : `arg${String(index)}`;
      return { name, isOptional, isSynthesized: true };
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
export function hasReturnValue(node: ts.SignatureDeclaration): boolean {
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
export function classifyFunction(
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
 * Reports whether an initializer could hold a callable value.
 *
 * @remarks
 * The `useX` naming convention alone does not make an export a hook: a plain
 * data export named `useDefaults` would get a "React hook …" summary it does not
 * deserve. Requiring a literal function expression is too strict in the other
 * direction, because hooks are routinely produced by a factory call
 * (`export const useStore = create(…)`), so only initializers that provably
 * cannot be callable are rejected. A missing initializer stays eligible: an
 * ambient `declare const useTheme: () => Theme` is a hook declaration.
 *
 * @param initializer - The declarator's initializer, when present.
 * @returns `false` only for literals that can never be a function.
 */
export function mayHoldFunction(
  initializer: ts.Expression | undefined,
): boolean {
  if (initializer === undefined) {
    return true;
  }
  return !(
    ts.isObjectLiteralExpression(initializer) ||
    ts.isArrayLiteralExpression(initializer) ||
    ts.isStringLiteral(initializer) ||
    ts.isNumericLiteral(initializer) ||
    ts.isBigIntLiteral(initializer) ||
    ts.isNoSubstitutionTemplateLiteral(initializer) ||
    ts.isTemplateExpression(initializer) ||
    ts.isRegularExpressionLiteral(initializer) ||
    initializer.kind === ts.SyntaxKind.TrueKeyword ||
    initializer.kind === ts.SyntaxKind.FalseKeyword ||
    initializer.kind === ts.SyntaxKind.NullKeyword
  );
}
