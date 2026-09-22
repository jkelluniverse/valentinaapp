import Link from "next/link";

// C35-FOUNDERS-EVENT §12 — the confirmation. It promises a conversation, NOT a
// portal (ruling 189): nothing here implies a practice has been created, and
// nothing links to /signup.

export const dynamic = "force-dynamic";

export default function ApplyThanksPage() {
  return (
    <main style={{ background: "var(--pf-indigo)", color: "var(--pf-cream)", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header>
        <div className="pf-wrap" style={{ display: "flex", alignItems: "center", minHeight: 72 }}>
          <Link href="/founders" style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/lockup-horizontal-reversed.svg" alt="Psychefolio" style={{ height: 30, width: "auto" }} />
          </Link>
        </div>
      </header>
      <div className="pf-wrap" style={{ maxWidth: 680, paddingTop: 72, flex: 1 }}>
        <p className="pf-eyebrow" style={{ color: "var(--pf-gold)", margin: 0 }}>Application received</p>
        <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)", margin: "16px 0 0" }}>Thank you — we have it.</h1>
        <p className="pf-lede" style={{ marginTop: 20, color: "rgba(250,240,239,.86)" }}>
          We read every application ourselves. If the founding cohort looks like a fit, we will reach out to arrange a
          20-minute conversation about your practice.
        </p>
        <p style={{ marginTop: 18, color: "rgba(250,240,239,.7)", lineHeight: 1.7 }}>
          Nothing has been charged and no seat is held. A seat is claimed only after acceptance, signed terms, and
          successful first payment.
        </p>
        <p style={{ marginTop: 32 }}>
          <Link href="/founders" style={{ color: "var(--pf-cream)", textDecoration: "underline", textUnderlineOffset: 4 }}>
            Back to the founding page
          </Link>
        </p>
      </div>
    </main>
  );
}
