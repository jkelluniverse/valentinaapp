import { signOut } from "@/auth";

// Server component: a small form whose action signs the user out and returns
// them to the login screen.
export function SignOutForm({ className = "" }: { className?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button className={`text-sm text-slate underline-offset-4 hover:text-wine hover:underline ${className}`}>
        Sign out
      </button>
    </form>
  );
}
