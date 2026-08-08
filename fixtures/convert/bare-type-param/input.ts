/**
 * Returns its argument unchanged.
 *
 * @template T
 * @param value The value to echo back.
 * @returns The same value.
 */
export function identity<T>(value: T): T {
  return value;
}
