/**
 * Minimal ANSI color helpers for terminal output.
 *
 * @remarks
 * A dependency-free factory rather than a library: the CLI needs only a handful
 * of styles, and keeping them here avoids inflating the bundle. Color can be
 * disabled (for non-TTY output, `NO_COLOR`, or `--report`) by constructing with
 * `enabled: false`, which returns identity functions.
 *
 * @since 0.1.0
 */

/**
 * A set of style functions that wrap text in ANSI escape codes.
 */
export interface Colors {
  /** Bold text. */
  readonly bold: (text: string) => string;
  /** Dim text. */
  readonly dim: (text: string) => string;
  /** Red text. */
  readonly red: (text: string) => string;
  /** Green text. */
  readonly green: (text: string) => string;
  /** Cyan text. */
  readonly cyan: (text: string) => string;
  /** Yellow text. */
  readonly yellow: (text: string) => string;
}

/**
 * Wraps `text` in an ANSI SGR code when enabled.
 *
 * @param code - The SGR code number.
 * @param text - The text to style.
 * @param enabled - Whether styling is applied.
 * @returns The styled (or untouched) text.
 */
function style(code: number, text: string, enabled: boolean): string {
  return enabled ? `[${code}m${text}[0m` : text;
}

/**
 * Builds a {@link Colors} instance.
 *
 * @param enabled - When `false`, every function returns its input unchanged.
 * @returns The style functions.
 */
export function createColors(enabled: boolean): Colors {
  return {
    bold: (text) => style(1, text, enabled),
    dim: (text) => style(2, text, enabled),
    red: (text) => style(31, text, enabled),
    green: (text) => style(32, text, enabled),
    cyan: (text) => style(36, text, enabled),
    yellow: (text) => style(33, text, enabled),
  };
}

/**
 * Decides whether ANSI color should be used for a stream.
 *
 * @param isTty - Whether the target stream is a TTY.
 * @param env - The environment (checked for `NO_COLOR`).
 * @returns `true` when color is appropriate.
 */
export function shouldUseColor(
  isTty: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env["NO_COLOR"] !== undefined && env["NO_COLOR"] !== "") {
    return false;
  }
  return isTty;
}
