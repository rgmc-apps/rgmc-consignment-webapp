/* bcryptjs is only needed at login / password change; loading it on demand keeps it
   out of the main bundle every page load pays for. */
export async function loadBcrypt() {
  return (await import('bcryptjs')).default;
}
