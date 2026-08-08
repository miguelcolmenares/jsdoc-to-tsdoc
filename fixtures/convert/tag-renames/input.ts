/**
 * Returns the value unchanged.
 * @template T The element type.
 * @param {T} value The value to echo.
 * @return {T} The same value.
 */
export function identity<T>(value: T): T {
  return value;
}
