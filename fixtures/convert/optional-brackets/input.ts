/**
 * Formats a label.
 * @param {string} text The base text.
 * @param {string} [suffix] An optional suffix.
 */
export function label(text: string, suffix?: string): string {
  return suffix ? `${text} ${suffix}` : text;
}
