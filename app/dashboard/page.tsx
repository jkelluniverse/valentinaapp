import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  // Round-trip: read this user straight from Postgres.
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { email: true, name: true, role: true, createdAt: true },
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Hello, authenticated world 👋</h1>
      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <p><span className="text-neutral-500">Signed in as:</span> {user?.email}</p>
        <p><span className="text-neutral-500">Role:</span> {user?.role}</p>
        <p><span className="text-neutral-500">Loaded from Postgres:</span> yes</p>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button className="text-sm text-neutral-600 underline">Sign out</button>
      </form>
    </main>
  );
}
