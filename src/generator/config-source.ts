/**
 * Comment-aware reading of ESLint flat-config text.
 *
 * @remarks
 * Two commands rewrite a flat config as text: `init` inserts the TSDoc plugins
 * and rules, and `escalate` changes the presence rule's severity. Both must tell
 * real code from commented-out code — a `// import … "eslint-plugin-tsdoc"` must
 * not count as "already configured", and a commented-out rule assignment must
 * not be rewritten (which would report a successful escalation while the real
 * rule stayed at `warn`).
 *
 * Classifying whole lines is not enough, because comments do not respect line
 * boundaries in either direction: a block comment can open mid-line
 * (`export default [ /* …`) and a line comment can trail real code. So each line
 * is scanned character by character and every comment character is replaced by a
 * space. The mask is length-preserving, so an offset into `code` is the same
 * offset into `text` — callers can match against `code` and splice into `text`.
 *
 * String and template literals are scanned as data, never as comments. That is
 * what keeps the `/*`…`*\/` inside a common glob such as `"src/**\/*.ts"` from
 * being mistaken for a comment — the trap that a naive `/* … *\/` strip falls
 * into.
 *
 * Known limit: a regular-expression literal is not recognized as its own token,
 * so a `//` or `/*` inside one (`/https?:\/\//`) masks the rest of the line.
 * That fails closed — a rule assignment sharing the line is missed and reported
 * as "not configured" rather than silently rewritten — and a regex literal
 * beside a rule assignment does not occur in practice.
 *
 * @since 0.1.0
 */

/**
 * One line of a config file, paired with its comment-free form.
 */
export interface ConfigLine {
  /** The line's original text, without its trailing newline. */
  readonly text: string;
  /**
   * The same line with every comment character replaced by a space. Identical in
   * length to {@link ConfigLine.text}, so offsets are interchangeable.
   */
  readonly code: string;
}

/** Scanner state that survives a line break. */
interface ScanState {
  /** Whether an unterminated block comment is open. */
  inBlockComment: boolean;
  /**
   * The open quote character, or `""` outside a literal. Only a backtick
   * survives a line break; an unterminated `"` or `'` means broken source, so
   * the state is dropped rather than swallowing the rest of the file.
   */
  quote: string;
}

/**
 * Masks the comment characters of one line, advancing the carried scan state.
 *
 * @param text - The line's text.
 * @param state - The scanner state, mutated as the line is consumed.
 * @returns The line with comment characters replaced by spaces.
 */
function maskLine(text: string, state: ScanState): string {
  const out: string[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text.charAt(index);
    // `charAt` yields "" past the end, so the two-character lookaheads below
    // simply fail at the last column instead of needing a bounds check.
    const next = text.charAt(index + 1);

    if (state.inBlockComment) {
      if (char === "*" && next === "/") {
        state.inBlockComment = false;
        out.push("  ");
        index += 2;
        continue;
      }
      out.push(" ");
      index += 1;
      continue;
    }

    if (state.quote !== "") {
      // An escape consumes the next character, so `"\\"` does not read as an
      // unterminated string and `"\""` does not close early.
      if (char === "\\") {
        out.push(text.slice(index, index + 2));
        index += 2;
        continue;
      }
      if (char === state.quote) {
        state.quote = "";
      }
      out.push(char);
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      out.push(" ".repeat(text.length - index));
      break;
    }
    if (char === "/" && next === "*") {
      state.inBlockComment = true;
      out.push("  ");
      index += 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      state.quote = char;
    }
    out.push(char);
    index += 1;
  }

  // A template literal legitimately spans lines; anything else does not.
  if (state.quote !== "`") {
    state.quote = "";
  }
  return out.join("");
}

/**
 * Splits config source into lines, masking the comment characters of each.
 *
 * @param source - The config file contents.
 * @returns One {@link ConfigLine} per line, in source order.
 *
 * @example
 * ```typescript
 * readConfigLines('const a = 1; // note');
 * // [{ text: "const a = 1; // note", code: "const a = 1;         " }]
 * ```
 */
export function readConfigLines(source: string): readonly ConfigLine[] {
  const state: ScanState = { inBlockComment: false, quote: "" };
  return source
    .split("\n")
    .map((text) => ({ text, code: maskLine(text, state) }));
}
