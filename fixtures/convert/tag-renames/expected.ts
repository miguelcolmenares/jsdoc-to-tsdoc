/**
 * Returns the value unchanged.
 * @typeParam T - The element type.
 * @param value - The value to echo.
 * @returns The same value.
 */
export function identity<T>(value: T): T {
  return value;
}
