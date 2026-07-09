import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PromptForm } from "../PromptForm";
import { updatePrompt } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditPromptPage({
  params,
  searchParams,
}: {
  params: { promptId: string };
  searchParams: { error?: string };
}) {
  await requirePractitioner();

  const prompt = await prisma.prompt.findUnique({ where: { id: params.promptId } });
  if (!prompt) notFound();

  const action = updatePrompt.bind(null, prompt.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Library</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Edit item</h1>
        <SignatureRule />
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <PromptForm
          action={action}
          defaults={{ title: prompt.title, body: prompt.body, kind: prompt.kind }}
          submitLabel="Save changes"
          error={searchParams.error === "missing" ? "A title and the text are both needed." : null}
        />
      </div>

      <Link
        href="/practitioner/library"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to the library
      </Link>
    </div>
  );
}
