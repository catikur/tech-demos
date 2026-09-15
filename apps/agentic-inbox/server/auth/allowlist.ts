/** Sign-in is limited to one Microsoft 365 email domain (default: conforcus.com). */

export function allowedLoginDomain(): string {
  return (process.env.ALLOWED_LOGIN_DOMAIN ?? "conforcus.com").trim().toLowerCase().replace(/^@/, "");
}

export function emailAllowed(email: string): boolean {
  const value = email.trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return false;
  return value.slice(at + 1) === allowedLoginDomain();
}
