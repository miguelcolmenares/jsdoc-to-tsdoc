/**
 * Rule: rewrite the `{Type}` on `@throws` into TSDoc's link form.
 *
 * @since 0.2.2
 */

import { mapCommentLines } from "@/parser";
import type { Rule } from "@/transformer/pipeline";

// Runs after `rename-tags`, so JSDoc's `@exception` synonym has already become
// `@throws` and only the one spelling needs matching here.
const THROWS_TYPE = /^(@throws)\s+\{([^}]*)\}[ \t]*/;

// A declaration reference TSDoc can resolve: a dotted path of identifiers.
// Anything else — a union (`{Error|TypeError}`), a generic (`{Array<string>}`),
// a wildcard (`{*}`) — is not a name `{@link}` could ever point at.
const DECLARATION_REFERENCE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

// Spelled-out TypeScript types that parse as identifiers but declare nothing,
// so `{@link string}` would render as a permanently unresolved link. These stay
// plain prose.
const UNLINKABLE_TYPES: ReadonlySet<string> = new Set([
  "any",
  "bigint",
  "boolean",
  "never",
  "null",
  "number",
  "object",
  "string",
  "symbol",
  "undefined",
  "unknown",
  "void",
]);

/**
 * Renders a thrown type as the text that follows `@throws`.
 *
 * @param type - The type as written between the JSDoc braces, already trimmed.
 * @returns A `{@link}` reference when the type names something that could
 * resolve, and the bare type text otherwise.
 */
function renderThrownType(type: string): string {
  const linkable =
    DECLARATION_REFERENCE.test(type) && !UNLINKABLE_TYPES.has(type);
  return linkable ? `{@link ${type}}` : type;
}

/**
 * Rewrites `@throws {SyntaxError} …` into `@throws {@link SyntaxError} …`.
 *
 * @remarks
 * `remove-type-braces` strips `{Type}` from `@param` and `@returns` because the
 * TypeScript signature still carries the type. A thrown type appears in no
 * signature, so stripping the braces here would delete the only information the
 * tag holds. Left alone it is worse still: the official parser reads the `{` as
 * opening an inline tag and reports two errors on the line.
 *
 * The type is linked only when it names something that could resolve. A
 * primitive such as `string`, or a compound expression such as a union or a
 * generic, becomes plain prose instead: a link to a primitive is valid syntax
 * that renders as a permanently broken link, which is a worse outcome than
 * text because it asserts a reference that does not exist.
 *
 * @example
 * ```typescript
 * linkThrowsType.apply("/** @throws {SyntaxError} On bad input. *\/");
 * // → "/** @throws {@link SyntaxError} On bad input. *\/"
 * linkThrowsType.apply("/** @throws {string} On bad input. *\/");
 * // → "/** @throws string On bad input. *\/"
 * ```
 */
export const linkThrowsType: Rule = {
  name: "link-throws-type",
  summary: "Rewrite `@throws {Type}` as `{@link Type}`, or as plain prose.",
  liteSafe: false,
  apply(comment) {
    return mapCommentLines(comment, (content, context) => {
      if (context.inFence) {
        return content;
      }

      const match = THROWS_TYPE.exec(content);
      if (!match) {
        return content;
      }

      const [matched, tag = "", braced = ""] = match;
      const type = braced.trim();

      // Already TSDoc: `@throws {@link Foo}` would otherwise be read as a type
      // named `@link Foo` and flattened into prose, breaking a correct comment.
      if (type.startsWith("@")) {
        return content;
      }

      const rest = content.slice(matched.length);
      // Joining the non-empty pieces keeps `@throws {Error}` with no
      // description from ending in a trailing space (#88).
      return [tag, renderThrownType(type), rest].filter(Boolean).join(" ");
    });
  },
};
