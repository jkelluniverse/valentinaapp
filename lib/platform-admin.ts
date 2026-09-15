// The PLATFORM_ADMIN_EMAILS allowlist, in one place. No ADMIN role exists in
// the schema and none is invented here (C23-CAPTURE §3): the env list is the
// explicit, auditable substitute, exactly as /admin/tenants/new has used it
// since PLATFORM §7. Extracted only so the several admin surfaces that need it
// cannot drift apart; the rule itself is unchanged.

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
