import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { initialItemsOf, type InitialItem } from "@/lib/agreements";
import { confirmUploadAction, discardUploadAction } from "../../actions";

// C21.2 — the upload PREVIEW: nothing saves or sends until the
// practitioner has SEEN the result. A converted Word document renders
// exactly as the signer will meet it, every detected field visually
// placed in the text; attached files list out with open links. Confirm
// releases it (save as template and/or send now); Discard deletes it.

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  text: "type-in field",
  initials: "initials",
  checkbox: "checkbox",
};

function FieldPill({ item }: { item: InitialItem }) {
  return (
    <span
      data-field-pill
      className={`${item.multiline ? "my-1.5 flex w-full justify-start" : "mx-0.5 inline-flex align-baseline"} rounded-md border border-mocha bg-blush/40 px-2 py-0.5 text-[12.5px] font-medium text-wine`}
    >
      ✍ {item.text}
    </span>
  );
}

function PreviewBody({ body, items }: { body: string; items: InitialItem[] }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const parts = body.split(/(\{\{fill:[a-z0-9_-]+\}\})/gi);
  return (
    <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-white p-5 text-[14px] leading-relaxed text-ink shadow-soft">
      {parts.map((part, i) => {
        const m = /^\{\{fill:([a-z0-9_-]+)\}\}$/i.exec(part);
        const item = m ? byId.get(m[1]) : undefined;
        return item ? <FieldPill key={i} item={item} /> : <span key={i}>{part}</span>;
      })}
    </div>
  );
}

export default async function UploadPreviewPage({
  params,
  searchParams,
}: {
  params: { templateId: string };
  searchParams: { error?: string };
}) {
  await requirePractitioner();
  const template = await prisma.agreementTemplate.findFirst({ where: { id: params.templateId } });
  if (!template) notFound();
  const items = initialItemsOf(template);
  const files = await prisma.agreementFile.findMany({ where: { templateId: template.id }, orderBy: { createdAt: "asc" } });
  const inlineIds = new Set([...template.body.matchAll(/\{\{fill:([a-z0-9_-]+)\}\}/gi)].map((m) => m[1]));
  const ackItems = items.filter((i) => i.kind !== "text");
  const fieldCls =
    "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements · upload preview</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">{template.title}</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          {template.kind === "TEXT"
            ? "This is exactly what your signer will meet. Every detected field is shown in place — check that each one sits where it belongs before releasing it."
            : "The attached file(s) are shown to the signer for review, exactly as uploaded, with the signature ceremony beneath. Open each to double-check it."}
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>
      )}

      {template.kind === "TEXT" ? (
        <>
          <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">
            {items.length === 0
              ? "No fields detected — the signer reads and signs"
              : `${items.length} field${items.length === 1 ? "" : "s"} detected · shown in place below`}
          </p>
          <PreviewBody body={template.body} items={items} />
          {items.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-mocha">Field checklist</span>
              {items.map((i) => (
                <span key={i.id} className="text-[13px] text-ink">
                  ✍ <strong>{i.text}</strong>
                  <span className="text-whisper">
                    {" "}
                    — {KIND_LABEL[i.kind] ?? i.kind}
                    {i.multiline ? ", longer answer" : ""}
                    {i.kind === "text" && !inlineIds.has(i.id) ? ", asked beside the document" : i.kind === "text" ? ", filled in place" : ", acknowledged before signing"}
                  </span>
                </span>
              ))}
            </div>
          )}
          {ackItems.length > 0 && (
            <p className="text-[13px] text-whisper">
              Initials/checkbox items appear as required acknowledgments beside the signature — not inside the text.
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-4 shadow-soft">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Documents in this request</span>
          {files.map((f) => (
            <a
              key={f.id}
              href={`/api/agreement-templates/${template.id}/files/${f.id}`}
              target="_blank"
              className="flex items-center justify-between rounded-md border border-line px-3.5 py-2.5 text-[14px] text-wine underline-offset-4 hover:bg-blush/20 hover:underline"
            >
              <span>{f.filename}</span>
              <span className="text-[12px] text-whisper">{(f.size / 1024).toFixed(0)} KB · open ↗</span>
            </a>
          ))}
          <p className="text-[12px] text-whisper">
            Fields can&apos;t be placed inside a PDF — to get fillable blanks in the text, upload the Word (.docx) version
            with underscores (______) or [[text: Label]] where answers go.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Looks right?</p>
        <form action={confirmUploadAction.bind(null, template.id)} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="mode" value="send" />
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Recipient name
            <input name="recipientName" required className={fieldCls} placeholder="Full name" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Recipient email
            <input name="recipientEmail" type="email" required className={fieldCls} placeholder="name@example.com" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[13px] text-slate">
            <input type="checkbox" name="keepTemplate" defaultChecked className="h-4 w-4 rounded border-line text-wine" />
            Keep as a reusable template
          </label>
          <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            Send for signature
          </PendingButton>
        </form>
        <div className="flex flex-wrap items-center gap-4">
          <form action={confirmUploadAction.bind(null, template.id)}>
            <input type="hidden" name="mode" value="save" />
            <PendingButton className="rounded-lg border border-wine px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush/30">
              Save as template (send later)
            </PendingButton>
          </form>
          <form action={discardUploadAction.bind(null, template.id)}>
            <PendingButton className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
              Discard this upload
            </PendingButton>
          </form>
          <Link href="/practitioner/agreements" className="ml-auto text-[13px] text-whisper hover:text-wine">
            ← back to the desk
          </Link>
        </div>
      </div>
    </div>
  );
}
