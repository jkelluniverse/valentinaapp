import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requirePractitioner } from "@/lib/auth-guards";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { EVENT_SOURCE, joinUrl } from "@/lib/capture-config";
import { getBaseUrl } from "@/lib/base-url";

// C23-CAPTURE §4 — the printable event QR. Rendered SERVER-SIDE as inline SVG
// (qrcode → toString({ type: "svg" })): no external image service, no
// client-side generation, no third-party request from the page. The page ships
// the whole code in its own HTML.
//
// The target URL is printed underneath in large plain text, because a QR that
// fails leaves the URL, and a URL that fails leaves nothing.
//
// Same gate as the rest of /admin/prospects: PLATFORM_ADMIN_EMAILS, 404 otherwise.
export const dynamic = "force-dynamic";

export default async function EventQrPage({ searchParams }: { searchParams: { src?: string } }) {
  const user = await requirePractitioner();
  if (!isPlatformAdmin(user.email)) notFound();

  const src = (searchParams.src ?? "").trim().slice(0, 120) || EVENT_SOURCE;
  // PLATFORM_DOMAIN is the print target when configured (the platform apex, not
  // whatever host the admin happens to be on); otherwise the request's own
  // origin, so a printed code is never a relative path.
  const url = joinUrl(src, process.env.PLATFORM_DOMAIN ? undefined : getBaseUrl());

  // Error-correction level H: a printed code survives a fingerprint, a fold and
  // a mediocre black-and-white printer. Pure black on pure white for the same
  // reason — no brand tint to lose contrast at arm's length.
  const svg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 print:px-0 print:py-0">
      <div className="print:hidden">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Platform admin</p>
        <h1 className="mt-2 font-headline text-3xl font-semibold text-ink-strong">Event QR</h1>
        <p className="mt-3 text-[15px] text-slate">
          Print this page. Black and white is fine — the code is pure black on white at error-correction
          level H. Nothing on this page loads from anywhere else.
        </p>
        <p className="mt-2 text-[13px] text-whisper">
          Source tag: <span className="font-mono">{src}</span>. Change it with{" "}
          <span className="font-mono">?src=</span>.
        </p>
      </div>

      {/* The printable sheet. Deliberately unstyled-ish: white background,
          black text, one enormous code, one enormous URL. */}
      <section className="mt-8 flex flex-col items-center gap-6 rounded-card border border-line bg-white p-10 print:mt-0 print:border-0 print:p-0">
        <p className="text-center font-headline text-3xl font-semibold text-black">
          Scan to leave your name
        </p>
        <p className="text-center font-headline text-xl text-black">Escanea y déjanos tu nombre</p>
        <div
          aria-label={`QR code for ${url}`}
          className="w-[18rem] max-w-full md:w-[26rem] print:w-[16cm]"
          // Server-generated inline SVG markup from the `qrcode` package —
          // no user input reaches the markup except the URL it encodes.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="break-all text-center font-mono text-2xl font-semibold text-black md:text-3xl">{url}</p>
      </section>
    </main>
  );
}
