/**
 * Minimal glob matching for `--only` / `--exclude` path filters.
 *
 * @remarks
 * Supports the subset of glob syntax the CLI documents: `**` (any run of
 * characters including `/`), `*` (any run except `/`), and `?` (a single
 * non-`/` character). Implemented in-domain to avoid a runtime dependency and
 * keep the bundle small.
 *
 * @since 0.1.0
 */

const REGEX_SPECIALS = new Set([
  ".",
  "+",
  "^",
  "$",
  "{",
  "}",
  "(",
  ")",
  "|",
  "[",
  "]",
  "\\",
]);

/**
 * Compiles a glob pattern to an anchored regular expression.
 *
 * @param glob - The glob pattern.
 * @returns A `RegExp` that matches an entire path against the glob.
 */
export function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i] ?? "";
    if (char === "*") {
      if (glob[i + 1] === "*") {
        i += 1;
        if (glob[i + 1] === "/") {
          i += 1;
          pattern += "(?:.*/)?";
        } else {
          pattern += ".*";
        }
      } else {
        pattern += "[^/]*";
      }
    } else if (char === "?") {
      pattern += "[^/]";
    } else if (REGEX_SPECIALS.has(char)) {
      pattern += `\\${char}`;
    } else {
      pattern += char;
    }
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * Normalizes a path to forward slashes for cross-platform glob matching.
 *
 * @param path - The path to normalize.
 * @returns The path with all backslashes converted to forward slashes.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Tests whether a path matches a glob pattern.
 *
 * @param path - The path to test (separators are normalized).
 * @param glob - The glob pattern.
 * @returns `true` when the entire path matches.
 */
export function matchesGlob(path: string, glob: string): boolean {
  return globToRegExp(glob).test(normalizePath(path));
}

/**
 * Builds a predicate that keeps paths matching every `only` pattern set and no
 * `exclude` pattern.
 *
 * @param filters - Optional `only` and `exclude` glob lists.
 * @returns A predicate returning `true` for paths that pass the filter.
 */
export function createPathFilter(filters: {
  readonly only?: readonly string[];
  readonly exclude?: readonly string[];
}): (path: string) => boolean {
  const only = filters.only ?? [];
  const exclude = filters.exclude ?? [];
  return (path: string): boolean => {
    const normalized = normalizePath(path);
    if (only.length > 0 && !only.some((glob) => matchesGlob(normalized, glob))) {
      return false;
    }
    if (exclude.some((glob) => matchesGlob(normalized, glob))) {
      return false;
    }
    return true;
  };
}
