/**
 * Loads a user by id.
 * @param id - The user id.
 * @returns The loaded user.
 */
export async function loadUser(id: string): Promise<User> {
  return fetch(id) as unknown as Promise<User>;
}
