// AMENDMENT-02 §5 — display casing for names. Stored names may be lowercase
// ("jacob tony"); render them properly cased. An email (a stand-in for a
// missing name) is left as-is.
export function titleCaseName(name: string): string {
  if (name.includes("@")) return name;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 2 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

export function firstNameOf(name: string): string {
  return titleCaseName(name).split(" ")[0];
}

// name || email, properly cased.
export function displayName(user: { name: string | null; email: string }): string {
  return user.name ? titleCaseName(user.name) : user.email;
}
