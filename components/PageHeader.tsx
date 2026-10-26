import { SignatureRule, Eyebrow } from "@/components/brand";

// AMENDMENT-04 §1a — page headers collapse on mobile. The editorial stack
// (eyebrow + display title + rule + lede) is a desktop luxury; on a phone the
// first viewport must show content, not chrome. One compact row — 20px Crimson
// title + optional right-side action — then straight into the page.
export function PageHeader({
  title,
  eyebrow,
  lede,
  action,
}: {
  title: string;
  eyebrow?: string;
  lede?: string;
  action?: React.ReactNode;
}) {
  return (
    <header>
      {/* Mobile: one compact row. */}
      <div className="flex min-h-[2.25rem] items-center justify-between gap-3 md:hidden">
        <h1 className="font-headline text-xl font-semibold text-wine">{title}</h1>
        {action}
      </div>
      {/* Desktop: the editorial stack. */}
      <div className="hidden flex-col gap-2 md:flex">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-[2.25rem] font-semibold">{title}</h1>
          {action}
        </div>
        <SignatureRule />
        {lede && <p className="max-w-prose text-ink">{lede}</p>}
      </div>
    </header>
  );
}
