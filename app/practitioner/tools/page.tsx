import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { toolModulesFor } from "@/lib/modules/registry";
import { SignatureRule, Eyebrow } from "@/components/brand";

// PLATFORM Phase 4 — the practitioner tools hub. Exists ONLY for tenants
// with SESSION/MANUAL_TOOL modules enabled; everyone else (Valentina) gets
// a 404 and never sees a link to it.

export const dynamic = "force-dynamic";

const TOOL_ROUTES: Record<string, { href: string; hint: string }> = {
  "tarot-draw": { href: "/practitioner/tools/draw", hint: "Draw cards in session — each draw is kept as a dated reading." },
  "lookup-console": { href: "/practitioner/tools/lookup", hint: "Query positions for any date and place — optionally save to a client." },
};

export default async function ToolsHub() {
  await requirePractitioner();
  const tenant = await getTenant();
  const rows = await prisma.tenantModule.findMany({ where: { tenantId: tenant.id } });
  const tools = toolModulesFor(rows);
  if (tools.length === 0) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Tools</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Session &amp; research tools</h1>
        <SignatureRule />
      </div>
      <div className="flex flex-col gap-3">
        {tools.map((t) => {
          const route = TOOL_ROUTES[t.key];
          if (!route) return null;
          const row = rows.find((r) => r.moduleKey === t.key);
          const label = ((row?.settings ?? {}) as { displayLabel?: string }).displayLabel ?? t.defaultLabel;
          return (
            <Link
              key={t.key}
              href={route.href}
              className="flex flex-col gap-1 rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-mocha"
            >
              <span className="font-medium text-ink-strong">{label}</span>
              <span className="text-sm text-slate">{route.hint}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
