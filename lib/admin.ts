/**
 * Who may see operational pages (/admin/usage).
 *
 * A comma-separated allowlist in ADMIN_EMAILS. When unset, the demo account
 * is the admin so the public demo can show the usage page; a real deployment
 * sets the variable and the demo account loses access.
 */
const DEFAULT_ADMINS = ["demo@example.com"];

export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return DEFAULT_ADMINS;
  return raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}
