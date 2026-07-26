/**
 * Derivation of prose summaries from identifier names.
 *
 * @remarks
 * The scaffolder is deterministic and LLM-free, so a stub's summary can only be
 * inferred from the identifier itself. Splitting the name into words and mapping
 * a leading verb to its third-person form yields "Submits the contact form."
 * from `submitContactForm` — accurate often enough to be useful, and always
 * marked with a `TODO(tsdoc)` so a human confirms it.
 *
 * @since 0.1.0
 */

/**
 * Verbs that make an identifier a predicate (`isValidEmail`, `hasAccess`). These
 * read as "Reports whether …" with no article before the remaining words.
 */
const PREDICATE_VERBS: ReadonlySet<string> = new Set([
  "is",
  "has",
  "can",
  "should",
  "will",
  "was",
]);

/**
 * Verbs whose third-person singular form is not produced by appending `s`.
 * Keyed by the lowercase verb as it appears at the start of an identifier.
 */
const IRREGULAR_VERBS: ReadonlyMap<string, string> = new Map([
  ["do", "Does"],
  ["go", "Goes"],
]);

/**
 * Verbs ending in a sibilant, where the third-person form takes `es`.
 */
const SIBILANT_ENDINGS: readonly string[] = Object.freeze([
  "s",
  "x",
  "z",
  "ch",
  "sh",
]);

/**
 * Common leading verbs in identifiers. A name that starts with one of these is
 * rendered as a sentence ("Fetches the user."); any other name falls back to a
 * neutral noun-phrase summary.
 */
const KNOWN_VERBS: ReadonlySet<string> = new Set([
  "add",
  "apply",
  "build",
  "calculate",
  "check",
  "clear",
  "collect",
  "convert",
  "create",
  "delete",
  "detect",
  "extract",
  "fetch",
  "filter",
  "find",
  "format",
  "generate",
  "get",
  "handle",
  "load",
  "make",
  "map",
  "merge",
  "normalize",
  "parse",
  "patch",
  "read",
  "remove",
  "render",
  "reset",
  "resolve",
  "scan",
  "send",
  "set",
  "sort",
  "split",
  "strip",
  "submit",
  "transform",
  "update",
  "validate",
  "write",
  ...IRREGULAR_VERBS.keys(),
  ...PREDICATE_VERBS,
]);

/**
 * Splits an identifier into lowercase words.
 *
 * @remarks
 * Handles camelCase, PascalCase, kebab-case, snake_case, and acronym runs, so
 * `parseHTTPResponse` becomes `["parse", "http", "response"]`.
 *
 * @param name - The identifier to split.
 * @returns The constituent words, lowercased, in order.
 *
 * @example
 * ```typescript
 * splitIdentifier("submitContactForm"); // ["submit", "contact", "form"]
 * ```
 */
export function splitIdentifier(name: string): readonly string[] {
  return name
    .replace(/[-_]+/g, " ")
    // Split an acronym run from a following capitalized word: HTTPResponse.
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    // Split a lowercase or digit run from a following capital: parseHtml.
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 0);
}

/**
 * Converts a verb to its third-person singular form.
 *
 * @param verb - The lowercase base verb.
 * @returns The conjugated verb, capitalized.
 */
function conjugate(verb: string): string {
  const irregular = IRREGULAR_VERBS.get(verb);
  if (irregular !== undefined) {
    return irregular;
  }
  if (verb.endsWith("y") && !/[aeiou]y$/.test(verb)) {
    return capitalize(`${verb.slice(0, -1)}ies`);
  }
  if (SIBILANT_ENDINGS.some((ending) => verb.endsWith(ending))) {
    return capitalize(`${verb}es`);
  }
  return capitalize(`${verb}s`);
}

/**
 * Uppercases the first character of a word.
 *
 * @param word - The word to capitalize.
 * @returns The word with its first character uppercased.
 */
function capitalize(word: string): string {
  return word.length === 0 ? word : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`;
}

/**
 * Infers a one-sentence summary from a function-like identifier.
 *
 * @param name - The exported symbol name.
 * @returns A sentence ending in a period.
 *
 * @example
 * ```typescript
 * inferFunctionSummary("submitContactForm"); // "Submits the contact form."
 * inferFunctionSummary("isValidEmail");      // "Reports whether valid email."
 * ```
 */
export function inferFunctionSummary(name: string): string {
  const words = splitIdentifier(name);
  const [first, ...rest] = words;

  if (first === undefined) {
    return "TODO(tsdoc): describe this export.";
  }

  // A predicate reads without an article: "Reports whether valid email".
  if (PREDICATE_VERBS.has(first)) {
    return rest.length > 0
      ? `Reports whether ${rest.join(" ")}.`
      : "Reports whether the condition holds.";
  }

  if (KNOWN_VERBS.has(first) && rest.length > 0) {
    return `${conjugate(first)} the ${rest.join(" ")}.`;
  }
  if (KNOWN_VERBS.has(first)) {
    return `${conjugate(first)} the value.`;
  }

  return `${capitalize(words.join(" "))}.`;
}

/**
 * Infers a summary for a React component.
 *
 * @param name - The component name.
 * @returns A sentence describing what the component renders.
 *
 * @example
 * ```typescript
 * inferComponentSummary("HeroSection"); // "Renders the hero section."
 * ```
 */
export function inferComponentSummary(name: string): string {
  return `Renders the ${splitIdentifier(name).join(" ")}.`;
}

/**
 * Infers a summary for a React hook.
 *
 * @param name - The hook name, including the `use` prefix.
 * @returns A sentence describing the hook.
 *
 * @example
 * ```typescript
 * inferHookSummary("useHash"); // "React hook for the hash."
 * ```
 */
export function inferHookSummary(name: string): string {
  const rest = splitIdentifier(name).slice(1);
  if (rest.length === 0) {
    return "React hook.";
  }
  return `React hook for the ${rest.join(" ")}.`;
}

/**
 * Infers a summary for a type, interface, class, enum, or constant.
 *
 * @remarks
 * Rendered as the humanized identifier rather than a "&lt;Kind&gt; for the …"
 * phrase, which reads redundantly for the common case where the name already
 * ends in its own kind noun (`LeadFormConfig`, `ExportKind`).
 *
 * @param name - The exported symbol name.
 * @returns A noun-phrase sentence.
 *
 * @example
 * ```typescript
 * inferNounSummary("LeadFormConfig"); // "Lead form config."
 * ```
 */
export function inferNounSummary(name: string): string {
  const words = splitIdentifier(name);
  if (words.length === 0) {
    return "TODO(tsdoc): describe this export.";
  }
  return `${capitalize(words.join(" "))}.`;
}
