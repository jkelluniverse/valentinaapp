import Link from "next/link";
import { CARD_SOURCE, INCLUDED, PRICING, SEATS_STATEMENT, TERMS_BULLETS, ADDENDUM_URL } from "@/lib/founders-config";

// C35-FOUNDERS-EVENT STAGE 2 — the founding page. Replaces Stage 1's redirect.
//
// RULING 176 — THERE IS NO SEAT COUNTER. The brief specifies a live "7 of 20
// seats claimed" card with a progress bar; it is CUT ENTIRELY, not hidden and
// not zeroed. `SEATS_STATEMENT` is a fixed statement of the offer's terms, and
// the close DATE is static text, never a countdown.
//
// RULING 188 — the Practice Manager agent, the morning brief and the admin/VA
// seat are CUT from the included list. They do not exist, and a paid page
// states what exists today. See lib/founders-config.ts.
//
// RULING 189 — every CTA on this page goes to /founders/apply. NOTHING here
// links to /signup, which provisions a free practice.
//
// ENGLISH ONLY — a NAMED deviation from law 7, ratified by Jacob: the Spanish
// copy does not exist, and machine-translating commercial and legal terms
// creates exposure. Tracked, not silent.

export const dynamic = "force-dynamic";

const NAV = [
  { href: "#included", label: "What's Included" },
  { href: "#partnership", label: "Founding Partnership" },
  { href: "#faq", label: "FAQ" },
];

const BENEFITS = [
  { h: "Practice, connected.", p: "Clients, scheduling, packages, billing, agreements, notes, reflections, programs, and communication live in one thoughtful system." },
  { h: "Context that carries forward.", p: "Client Intelligence helps return relevant history, language, themes, and source material so you can continue the work without losing the thread." },
  { h: "A voice in what comes next.", p: "Founding members receive direct access to the team and a structured place to influence the platform's priorities, flow, and future." },
];

const RECEIVE = [
  `${PRICING.foundingFirstYear}/month for the first 12 months`,
  `${PRICING.foundingAfter}/month locked while continuously active`,
  `${PRICING.onboardingIncluded} guided onboarding included`,
  "Complete Practice plan access",
  "Direct access to the product team",
  "Priority consideration for early capabilities",
  "Recognition as a founding practice",
  "90 days' notice of structural program changes",
];

const AGREE = [
  "Participate in three feedback calls during the first six months",
  "Provide an honest testimonial based on their experience",
  "Allow the practice name to appear in the founding-practice list",
  "Use the platform in good faith and provide candid feedback",
];

const GOOD_FIT = [
  "You run an active private practice with individual clients.",
  "Your work depends on understanding each person's context over time.",
  "Your process includes sessions, reflections, programs, resources, or between-session work.",
  "You value practitioner judgment and want technology to support rather than replace it.",
  "You can participate in onboarding and three structured feedback conversations.",
  "You want your client experience to feel coherent and thoughtfully branded.",
];

const NOT_YET = [
  "You are looking only for a basic calendar or payment link.",
  "You need a verified clinical, medical, insurance-billing, or regulatory configuration that Psychefolio has not approved.",
  "You want fully custom Studio development without a separate scope and modality build.",
  "You cannot participate in the founding feedback process.",
];

const STEPS = [
  { n: "1", h: "Apply", p: "Tell us about your practice, your methodology, and what you need your systems to do better." },
  { n: "2", h: "20-minute fit call", p: "We will confirm that Psychefolio fits your current practice and that the founding cohort fits what you are ready to build." },
  { n: "3", h: "Join and onboard", p: "If accepted and a seat remains, complete the Founding Practice agreement and subscription. Then begin guided onboarding with the cohort." },
];

// PSYCH-K® is a third-party mark: nominative use only, ® carried, no logo, and
// no endorsement or affiliation implied.
const FAQ = [
  { q: "Who is the founding program for?", a: "It is for active transformational practitioners who want a connected operating environment and are willing to help improve it through structured feedback. The first cohort begins with practitioners working in subconscious change, somatic work, coaching, psychology, holistic practice, PSYCH-K® facilitation, therapy, and related integrative fields. Product suitability still depends on each practice's requirements." },
  { q: "Is this a free trial?", a: `No. Founding Practice is a paid membership with guided onboarding and a ${PRICING.guaranteeDays}-day money-back guarantee. The cohort model gives us enough time to help you configure the platform and evaluate it inside your real workflow.` },
  { q: "What happens after the first year?", a: `Your rate changes from ${PRICING.foundingFirstYear} to ${PRICING.foundingAfter} per month and remains locked at that price while your subscription stays continuously active and you remain on the qualifying Practice plan.` },
  { q: `How are the ${PRICING.seats} seats selected?`, a: "We use a short application and a 20-minute fit call to confirm that Psychefolio matches the practice's current needs and that the practitioner can participate in the founding process. A seat is claimed after acceptance, signed terms, and successful first payment." },
  { q: "What do I need to contribute?", a: "Founding members participate in three feedback calls during the first six months, provide an honest testimonial about their experience, and allow their practice to be named as a founding practice. A fuller case study is optional." },
  { q: "What does guided onboarding include?", a: "Guided onboarding includes a live onboarding session, cohort resources, and help configuring the core Practice environment. Extensive migration, bilingual content setup, custom integrations, and methodology-specific development are separately scoped when needed." },
  { q: "Can I switch plans later?", a: "Yes, but plan changes affect the founding rate. An upgrade to Studio uses Studio pricing. A downgrade to Solo forfeits the founding rate. We explain the consequence before confirming any change." },
  { q: "What if I need to pause?", a: "Cancellation or a lapse ends the founding rate. If Sabbatical Mode is available at that time, it may preserve data under its published terms, but it does not preserve the founding rate unless the final agreement explicitly says so." },
  { q: "Is Psychefolio limited to PSYCH-K® practitioners?", a: "No. PSYCH-K® is an important first practitioner community, but Psychefolio is designed for transformational practitioners across multiple methods. The platform can be configured around different frameworks and information flows without implying endorsement of any modality." },
  { q: "Are clients limited?", a: "No. Founding Practice includes unlimited clients, and 60 recorded hours each month." },
];

export default function FoundersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const rawSource = Array.isArray(searchParams.source) ? searchParams.source[0] : searchParams.source;
  const fromCard = (rawSource ?? "").trim().toLowerCase() === CARD_SOURCE;

  // Ruling 189 — the ONLY destination. The source rides along so the apply
  // route can apply ruling 181's mapping to the stored row.
  const applyHref = rawSource ? `/founders/apply?source=${encodeURIComponent(rawSource)}` : "/founders/apply";

  const eyebrow = fromCard ? "Private event invitation · Founding Practice" : `Founding Practice · ${PRICING.seats} seats only`;

  return (
    <main>
      {/* ---------- 1. NAVIGATION ---------- */}
      <header style={{ background: "var(--pf-indigo)" }}>
        <nav className="pf-wrap" style={{ display: "flex", alignItems: "center", gap: 24, minHeight: 72 }} aria-label="Primary">
          <Link href="/founders" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/lockup-horizontal-reversed.svg" alt="Psychefolio" style={{ height: 30, width: "auto" }} />
          </Link>
          <ul style={{ display: "flex", gap: 28, listStyle: "none", margin: 0, padding: 0, marginLeft: "auto" }} className="pf-navlinks">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} style={{ color: "rgba(250,240,239,.82)", textDecoration: "none", fontSize: ".95rem" }}>{n.label}</a>
              </li>
            ))}
          </ul>
          <Link href="/login" style={{ color: "rgba(250,240,239,.7)", textDecoration: "none", fontSize: ".95rem" }}>Sign In</Link>
          <Link href={applyHref} className="pf-cta" style={{ minHeight: 44, padding: "0 20px", fontSize: ".95rem" }}>Apply</Link>
        </nav>
        <style>{`@media (max-width:860px){ .pf-navlinks{display:none !important;} }`}</style>
      </header>

      {/* ---------- 2. HERO ---------- */}
      <section style={{ background: "var(--pf-indigo)", color: "var(--pf-cream)", position: "relative", overflow: "hidden" }}>
        {/* Restrained constellation lines only (brief §3 avoid-list: no fantasy
            landscapes, no star fields). Decorative, hidden from assistive tech. */}
        <svg aria-hidden="true" focusable="false" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.24, pointerEvents: "none" }}>
          <g stroke="var(--pf-gold)" strokeWidth="1" fill="none">
            <path d="M 78% 12% L 88% 28% L 72% 42% L 92% 58%" />
            <path d="M 8% 78% L 22% 66% L 34% 84%" />
          </g>
          <g fill="var(--pf-gold)">
            {["78%,12%", "88%,28%", "72%,42%", "92%,58%", "8%,78%", "22%,66%", "34%,84%"].map((c) => {
              const [cx, cy] = c.split(",");
              return <circle key={c} cx={cx} cy={cy} r="2.5" />;
            })}
          </g>
        </svg>
        <div className="pf-wrap pf-section" style={{ position: "relative" }}>
          <p className="pf-eyebrow" style={{ color: "var(--pf-gold)", margin: 0 }}>{eyebrow}</p>
          <h1 style={{ fontSize: "clamp(2.75rem, 5.6vw, 5rem)", lineHeight: 1.05, margin: "18px 0 0", maxWidth: "16ch" }}>
            Help shape the operating system built for the way you practice.
          </h1>
          <p className="pf-lede" style={{ maxWidth: "58ch", marginTop: 22, color: "rgba(250,240,239,.86)" }}>
            Join Psychefolio&rsquo;s first practitioner cohort and bring your clients, sessions, reflections, programs,
            billing, agreements, and evolving client context into one connected environment.
          </p>
          {fromCard && (
            <p style={{ maxWidth: "62ch", marginTop: 16, color: "rgba(250,240,239,.72)", fontSize: ".98rem", lineHeight: 1.65 }}>
              Built by practitioners familiar with subconscious integration and whole-systems work&mdash;for practitioners
              whose methods do not fit neatly inside ordinary practice software.
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", marginTop: 34 }}>
            <Link href={applyHref} className="pf-cta">Apply for a Founding Seat</Link>
            <a href="#included" style={{ color: "var(--pf-cream)", textDecoration: "underline", textUnderlineOffset: 4 }}>See what&rsquo;s included</a>
          </div>
          <p style={{ marginTop: 26, color: "rgba(250,240,239,.66)", fontSize: ".92rem" }}>
            {SEATS_STATEMENT}. Enrollment closes {PRICING.closesText}.
          </p>
        </div>
      </section>

      {/* ---------- 3. THREE FOUNDING BENEFITS ---------- */}
      <section className="pf-section" style={{ background: "var(--pf-card)" }}>
        <div className="pf-wrap" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 0 }}>
          {BENEFITS.map((b, i) => (
            <div key={b.h} style={{ padding: "0 32px", borderLeft: i === 0 ? "none" : "1px solid rgba(46,39,73,.12)" }}>
              <h3 className="pf-display" style={{ fontSize: "1.45rem", margin: 0, color: "var(--pf-indigo)" }}>{b.h}</h3>
              <p style={{ marginTop: 12, lineHeight: 1.7, color: "var(--pf-slate)" }}>{b.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- 4. FOUNDING OFFER + PRICING CARD ---------- */}
      <section className="pf-section" style={{ background: "var(--pf-indigo)", color: "var(--pf-cream)" }}>
        <div className="pf-wrap" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,420px)", gap: 56, alignItems: "start" }}>
          <div>
            <p className="pf-eyebrow" style={{ color: "var(--pf-gold)", margin: 0 }}>A founding rate for the first twenty</p>
            <h2 className="pf-h2" style={{ marginTop: 16 }}>Practice-level access at the Solo price.</h2>
            <p className="pf-lede" style={{ marginTop: 20, color: "rgba(250,240,239,.86)", maxWidth: "52ch" }}>
              Receive the complete Practice plan, guided onboarding, and a permanent preferred rate in exchange for
              helping us learn from your real practice.
            </p>
            <ul style={{ marginTop: 28, paddingLeft: 20, lineHeight: 2, color: "rgba(250,240,239,.82)" }}>
              <li>Founding pricing from the first month</li>
              <li>Direct product feedback access</li>
              <li>Priority participation in early releases</li>
              <li>Recognition as one of the first twenty practices</li>
            </ul>
          </div>
          <div className="pf-card" style={{ padding: 32, color: "var(--pf-text)" }}>
            <p className="pf-eyebrow" style={{ color: "var(--pf-muted)", margin: 0 }}>Founding Practice</p>
            <p style={{ margin: "18px 0 0", color: "var(--pf-muted)" }}>
              <s>{PRICING.standardPractice}</s>{" "}
              <span style={{ fontSize: ".9rem" }}>standard Practice price</span>
            </p>
            <p style={{ margin: "6px 0 0", display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="pf-display" style={{ fontSize: "3rem", color: "var(--pf-indigo)" }}>{PRICING.foundingFirstYear}</span>
              <span style={{ color: "var(--pf-slate)" }}>/month</span>
            </p>
            <p style={{ margin: "2px 0 0", color: "var(--pf-slate)" }}>for your first 12 months</p>
            <hr style={{ border: 0, borderTop: "1px solid rgba(46,39,73,.12)", margin: "22px 0" }} />
            <p style={{ margin: 0, color: "var(--pf-text)" }}>
              Then <strong>{PRICING.foundingAfter}/month</strong> locked<br />
              <span style={{ color: "var(--pf-slate)", fontSize: ".95rem" }}>while continuously active</span>
            </p>
            <ul style={{ margin: "20px 0 0", paddingLeft: 20, lineHeight: 1.9, color: "var(--pf-text)" }}>
              <li>{PRICING.onboardingIncluded} guided onboarding included</li>
              <li>{PRICING.guaranteeDays}-day money-back guarantee</li>
            </ul>
            <Link href={applyHref} className="pf-cta" style={{ width: "100%", marginTop: 26 }}>Apply for a Founding Seat</Link>
            <p style={{ margin: "14px 0 0", fontSize: ".85rem", color: "var(--pf-muted)", textAlign: "center" }}>
              Enrollment closes {PRICING.closesText}.
            </p>
          </div>
        </div>
        <style>{`@media (max-width:900px){ #pf-offer-grid{grid-template-columns:1fr !important;} }`}</style>
      </section>

      {/* ---------- 5. EVERYTHING IN PRACTICE ---------- */}
      <section id="included" className="pf-section" style={{ background: "var(--pf-ivory)" }}>
        <div className="pf-wrap">
          <p className="pf-eyebrow" style={{ color: "var(--pf-muted)", margin: 0 }}>What&rsquo;s included</p>
          <h2 className="pf-h2" style={{ marginTop: 14, color: "var(--pf-indigo)" }}>Everything in Practice.</h2>
          <p className="pf-lede" style={{ marginTop: 18, maxWidth: "70ch", color: "var(--pf-slate)" }}>
            The full environment for practitioners who want the business of the practice, the client experience, and the
            developing context of the work to remain connected.
          </p>
          <div style={{ marginTop: 44, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 28 }}>
            {INCLUDED.map((g) => (
              <div key={g.label} className="pf-card" style={{ padding: 26 }}>
                <p className="pf-eyebrow" style={{ color: "var(--pf-gold)", margin: 0 }}>{g.label}</p>
                <ul style={{ margin: "16px 0 0", paddingLeft: 18, lineHeight: 1.85, color: "var(--pf-text)" }}>
                  {g.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 6. FOUNDING PARTNERSHIP ---------- */}
      <section id="partnership" className="pf-section" style={{ background: "var(--pf-card)" }}>
        <div className="pf-wrap">
          <h2 className="pf-h2" style={{ color: "var(--pf-indigo)", margin: 0 }}>This is a founding partnership.</h2>
          <p className="pf-lede" style={{ marginTop: 18, maxWidth: "72ch", color: "var(--pf-slate)" }}>
            We are building Psychefolio with practitioners, not simply for them. Your experience, perspective, and honest
            feedback will influence what we refine and build next. In return, you receive meaningful early pricing,
            guided onboarding, and direct access to the people shaping the platform.
          </p>
          <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 36 }}>
            <div>
              <h3 className="pf-display" style={{ fontSize: "1.25rem", color: "var(--pf-indigo)", margin: 0 }}>What founding members receive</h3>
              <ul style={{ margin: "16px 0 0", paddingLeft: 20, lineHeight: 1.95 }}>{RECEIVE.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <h3 className="pf-display" style={{ fontSize: "1.25rem", color: "var(--pf-indigo)", margin: 0 }}>What founding members agree to</h3>
              <ul style={{ margin: "16px 0 0", paddingLeft: 20, lineHeight: 1.95 }}>{AGREE.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 7. QUALIFICATION ---------- */}
      <section className="pf-section" style={{ background: "var(--pf-cream)" }}>
        <div className="pf-wrap">
          <p className="pf-eyebrow" style={{ color: "var(--pf-muted)", margin: 0 }}>Who this is for</p>
          <h2 className="pf-h2" style={{ marginTop: 14, color: "var(--pf-indigo)" }}>For practitioners ready to build with us.</h2>
          <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 36 }}>
            <div>
              <h3 className="pf-display" style={{ fontSize: "1.2rem", color: "var(--pf-indigo)", margin: 0 }}>A good fit</h3>
              <ul style={{ margin: "14px 0 0", paddingLeft: 20, lineHeight: 1.9 }}>{GOOD_FIT.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div>
              <h3 className="pf-display" style={{ fontSize: "1.2rem", color: "var(--pf-slate)", margin: 0 }}>Not the right fit yet</h3>
              <ul style={{ margin: "14px 0 0", paddingLeft: 20, lineHeight: 1.9, color: "var(--pf-slate)" }}>{NOT_YET.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 8. HOW IT WORKS ---------- */}
      <section className="pf-section" style={{ background: "var(--pf-card)" }}>
        <div className="pf-wrap">
          <p className="pf-eyebrow" style={{ color: "var(--pf-muted)", margin: 0 }}>How it works</p>
          <h2 className="pf-h2" style={{ marginTop: 14, color: "var(--pf-indigo)" }}>A simple path to get started.</h2>
          <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 28 }}>
            {STEPS.map((s) => (
              <div key={s.n} className="pf-card" style={{ padding: 26 }}>
                <p className="pf-display" style={{ fontSize: "2rem", color: "var(--pf-gold)", margin: 0 }}>{s.n}</p>
                <h3 className="pf-display" style={{ fontSize: "1.2rem", color: "var(--pf-indigo)", margin: "6px 0 0" }}>{s.h}</h3>
                <p style={{ marginTop: 10, lineHeight: 1.7, color: "var(--pf-slate)" }}>{s.p}</p>
              </div>
            ))}
          </div>
          {/* Brief §13, stated rather than implied: applying reserves nothing. */}
          <p style={{ marginTop: 28, fontWeight: 600, color: "var(--pf-indigo)", maxWidth: "70ch" }}>
            Completing the application does not reserve a seat. A seat is claimed only after acceptance, signed terms,
            and successful first payment.
          </p>
        </div>
      </section>

      {/* ---------- 9. FOUNDING TERMS SUMMARY ---------- */}
      <section className="pf-section" style={{ background: "var(--pf-ivory)" }}>
        <div className="pf-wrap">
          <h2 className="pf-h2" style={{ color: "var(--pf-indigo)", margin: 0, fontSize: "clamp(1.7rem,3vw,2.5rem)" }}>Clear terms from the beginning.</h2>
          <ul style={{ margin: "22px 0 0", paddingLeft: 20, lineHeight: 1.95, maxWidth: "78ch" }}>
            {TERMS_BULLETS.map((t) => <li key={t}>{t}</li>)}
          </ul>
          {/* The link renders ONLY when the Addendum exists. Never a placeholder,
              a draft, or a 404 — the dispatch is explicit. */}
          {ADDENDUM_URL && (
            <p style={{ marginTop: 20 }}>
              <a href={ADDENDUM_URL} style={{ color: "var(--pf-indigo)", fontWeight: 600 }}>Read the complete Founding Practice terms</a>
            </p>
          )}
        </div>
      </section>

      {/* ---------- 10. FAQ — native details/summary, works with JS disabled ---------- */}
      <section id="faq" className="pf-section" style={{ background: "var(--pf-card)" }}>
        <div className="pf-wrap" style={{ maxWidth: 900 }}>
          <h2 className="pf-h2" style={{ color: "var(--pf-indigo)", margin: 0, fontSize: "clamp(1.7rem,3vw,2.5rem)" }}>Questions</h2>
          <div style={{ marginTop: 26 }}>
            {FAQ.map((f) => (
              <details key={f.q} style={{ borderBottom: "1px solid rgba(46,39,73,.12)", padding: "18px 0" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--pf-indigo)", fontSize: "1.05rem", minHeight: 24, listStyle: "revert" }}>
                  {f.q}
                </summary>
                <p style={{ marginTop: 12, lineHeight: 1.75, color: "var(--pf-slate)" }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- 11. FINAL CTA + FOOTER ---------- */}
      <section className="pf-section" style={{ background: "var(--pf-indigo)", color: "var(--pf-cream)" }}>
        <div className="pf-wrap" style={{ maxWidth: 860 }}>
          <p className="pf-eyebrow" style={{ color: "var(--pf-gold)", margin: 0 }}>The first twenty</p>
          <h2 className="pf-h2" style={{ marginTop: 14 }}>Your seat in what Psychefolio becomes next.</h2>
          <p className="pf-lede" style={{ marginTop: 18, color: "rgba(250,240,239,.86)" }}>
            Bring us the way you practice. We will help you build a more connected operating environment around
            it&mdash;and learn from your experience as we shape what comes next.
          </p>
          <div style={{ marginTop: 30 }}>
            <Link href={applyHref} className="pf-cta">Apply for a Founding Seat</Link>
          </div>
          <p style={{ marginTop: 18, color: "rgba(250,240,239,.66)", fontSize: ".92rem" }}>
            Enrollment closes {PRICING.closesText} or when all {PRICING.seats} seats are claimed.
          </p>
        </div>
      </section>

      <footer style={{ background: "var(--pf-ink)", color: "rgba(250,240,239,.6)", padding: "36px 0" }}>
        <div className="pf-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", justifyContent: "space-between", fontSize: ".88rem" }}>
          <span>&copy; {new Date().getFullYear()} Psychefolio</span>
          <span style={{ maxWidth: "62ch" }}>
            PSYCH-K&reg; is a registered trademark of its owner. Psychefolio is independent and is not affiliated with,
            endorsed by, or sponsored by PSYCH-K&reg;.
          </span>
          <Link href="/privacy" style={{ color: "rgba(250,240,239,.6)" }}>Privacy</Link>
        </div>
      </footer>
    </main>
  );
}
