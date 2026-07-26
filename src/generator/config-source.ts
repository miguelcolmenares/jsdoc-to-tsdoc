/**
 * Comment-aware line reading for ESLint flat-config text.
 *
 * @remarks
 * Two commands rewrite a flat config as text: `init` inserts the TSDoc plugins
 * and rules, and `escalate` changes the presence rule's severity. Both must tell
 * real code from commented-out code — a `// import … "eslint-plugin-tsdoc"` must
 * not count as "already configured", and a commented-out rule line must not be
 * rewritten. This is the single place that distinction is made.
 *
 * A line-by-line block-comment state machine is used rather than a global
 * `/* … *\/` strip, because a naive strip would also eat the `/*`…`*\/` that
 * appear inside common glob strings such as `"src/**\/*.ts"`.
 *
 * @since 0.1.0
 */

/**
 * One line of a config file, flagged as real code or as comment text.
 */
export interface ConfigLine {
  /** The line's text, without its trailing newline. */
  readonly text: string;
  /** `true` when the line is real code rather than part of a comment. */
  readonly isCode: boolean;
}

/**
 * Splits config source into lines, flagging which of them are real code.
 *
 * @param source - The config file contents.
 * @returns One {@link ConfigLine} per line, in source order.
 *
 * @example
 * ```typescript
 * readConfigLines('// off\nrules: {},');
 * // [{ text: "// off", isCode: false }, { text: "rules: {},", isCode: true }]
 * ```
 */
export function readConfigLines(source: string): readonly ConfigLine[] {
  let inBlockComment = false;

  return source.split("\n").map((text) => {
    const trimmed = text.trim();

    if (inBlockComment) {
      // A `*/` anywhere on the line closes the block; whatever trails it is rare
      // enough in a flat config that the whole line stays treated as a comment.
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      return { text, isCode: false };
    }

    if (trimmed.startsWith("/*")) {
      // Enter a block comment unless it also closes on the same line.
      if (!trimmed.includes("*/")) {
        inBlockComment = true;
      }
      return { text, isCode: false };
    }

    return { text, isCode: !trimmed.startsWith("//") };
  });
}
