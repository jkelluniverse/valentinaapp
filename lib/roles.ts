// Where each role lands after signing in. Single source of truth so the login
// page, root dispatch, and cross-role redirects stay in sync.
export function roleHome(role?: string | null) {
  return role === "PRACTITIONER" ? "/practitioner" : "/space";
}
