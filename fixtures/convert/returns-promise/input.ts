/**
 * Loads a user by id.
 * @param {string} id The user id.
 * @returns {Promise<User>} The loaded user.
 */
export async function loadUser(id: string): Promise<User> {
  return fetch(id) as unknown as Promise<User>;
}
