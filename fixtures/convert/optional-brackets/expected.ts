/**
 * Formats a label.
 * @param text - The base text.
 * @param suffix - An optional suffix.
 */
export function label(text: string, suffix?: string): string {
  return suffix ? `${text} ${suffix}` : text;
}
