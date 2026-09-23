import Link from "next/link";
import { submitApplication } from "./actions";

// C35-FOUNDERS-EVENT §12 — the application.
//
// A PLAIN SERVER-ACTION FORM. No client component, no JS required: it submits
// and works with scripting disabled, which is the same discipline /join has
// been proving in the demo-path gate since C30. The time-trap `t` and the
// honeypot ride in hidden fields.
//
// RULING 189 — applying reserves NOTHING, and the page says so where a reader
// will actually see it rather than in a footnote.

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  missing: "Please give us at least your name and work email.",
  email: "That email address does not look right — please check it.",
  feedback: "Founding membership includes three feedback calls, so we need that confirmation to continue.",
  consent: "We need your permission to reply to your application.",
  rate: "That came through a little too quickly. Please try once more.",
  taken: "That email is already associated with a practice.",
};

const L = { display: "block", fontWeight: 600, fontSize: ".92rem", color: "var(--pf-indigo)", marginBottom: 6 } as const;
const I = {
  width: "100%", minHeight: 48, padding: "10px 14px", fontSize: "1rem",
  border: "1px solid rgba(46,39,73,.24)", borderRadius: 10, background: "#fff",
  color: "var(--pf-text)", fontFamily: "inherit",
} as const;
const ROW = { marginBottom: 20 } as const;

export default function ApplyPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const sp = (k: string) => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const error = sp("error");

  return (
    <main style={{ background: "var(--pf-ivory)", minHeight: "100dvh", paddingBottom: 72 }}>
      <header style={{ background: "var(--pf-indigo)" }}>
        <div className="pf-wrap" style={{ display: "flex", alignItems: "center", minHeight: 72 }}>
          <Link href="/founders" style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/lockup-primary-reversed.svg" alt="Psychefolio" style={{ width: 150, height: "auto", display: "block" }} />
          </Link>
        </div>
      </header>

      <div className="pf-wrap" style={{ maxWidth: 760, paddingTop: 56 }}>
        <h1 style={{ fontSize: "clamp(2rem,4vw,3rem)", color: "var(--pf-indigo)", margin: 0 }}>Tell us how you practice.</h1>
        <p className="pf-lede" style={{ marginTop: 16, color: "var(--pf-slate)" }}>
          This short application helps us make the 20-minute conversation useful. It does not reserve a seat and should
          take about four minutes.
        </p>

        {error && (
          <p role="alert" style={{ marginTop: 24, padding: "12px 16px", borderRadius: 10, background: "#FDECEC", color: "#8A1C1C", fontWeight: 500 }}>
            {ERRORS[error] ?? "Something did not go through. Please try again."}
          </p>
        )}

        <form action={submitApplication} className="pf-card" style={{ marginTop: 28, padding: 28 }}>
          <input type="hidden" name="t" value={Date.now()} />
          <input type="hidden" name="source" value={sp("source")} />
          <input type="hidden" name="ref" value={sp("ref")} />
          {/* Honeypot — off-screen, never shown, never announced. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
            <label htmlFor="company">Company</label>
            <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20 }}>
            <div style={ROW}>
              <label htmlFor="firstName" style={L}>First name</label>
              <input id="firstName" name="firstName" style={I} required maxLength={60} defaultValue={sp("firstName")} autoComplete="given-name" />
            </div>
            <div style={ROW}>
              <label htmlFor="lastName" style={L}>Last name</label>
              <input id="lastName" name="lastName" style={I} required maxLength={60} defaultValue={sp("lastName")} autoComplete="family-name" />
            </div>
          </div>

          <div style={ROW}>
            <label htmlFor="email" style={L}>Work email</label>
            <input id="email" name="email" type="email" style={I} required maxLength={200} defaultValue={sp("email")} autoComplete="email" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20 }}>
            <div style={ROW}>
              <label htmlFor="phone" style={L}>Mobile phone <span style={{ fontWeight: 400, color: "var(--pf-muted)" }}>· optional</span></label>
              <input id="phone" name="phone" type="tel" style={I} maxLength={40} defaultValue={sp("phone")} autoComplete="tel" />
            </div>
            <div style={ROW}>
              <label htmlFor="practiceName" style={L}>Practice name</label>
              <input id="practiceName" name="practiceName" style={I} maxLength={160} defaultValue={sp("practiceName")} autoComplete="organization" />
            </div>
          </div>

          <div style={ROW}>
            <label htmlFor="website" style={L}>Website or professional profile <span style={{ fontWeight: 400, color: "var(--pf-muted)" }}>· optional</span></label>
            <input id="website" name="website" style={I} maxLength={300} defaultValue={sp("website")} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20 }}>
            <div style={ROW}>
              <label htmlFor="practitionerType" style={L}>Primary practitioner type</label>
              <input id="practitionerType" name="practitionerType" style={I} maxLength={120} defaultValue={sp("practitionerType")} />
            </div>
            <div style={ROW}>
              <label htmlFor="modalities" style={L}>Primary methodology or modalities</label>
              <input id="modalities" name="modalities" style={I} maxLength={200} defaultValue={sp("modalities")} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 20 }}>
            <div style={ROW}>
              <label htmlFor="activeClients" style={L}>Approximate active clients</label>
              <input id="activeClients" name="activeClients" style={I} maxLength={40} defaultValue={sp("activeClients")} />
            </div>
            <div style={ROW}>
              <label htmlFor="soloOrTeam" style={L}>Solo practitioner or team</label>
              <select id="soloOrTeam" name="soloOrTeam" style={I} defaultValue={sp("soloOrTeam")}>
                <option value="">Select…</option>
                <option value="solo">Solo practitioner</option>
                <option value="team">Team</option>
              </select>
            </div>
          </div>

          <div style={ROW}>
            <label htmlFor="currentTools" style={L}>Current tools used to run the practice</label>
            <input id="currentTools" name="currentTools" style={I} maxLength={300} defaultValue={sp("currentTools")} />
          </div>

          <div style={ROW}>
            <label htmlFor="fragmented" style={L}>What feels most fragmented or difficult in your current system?</label>
            <textarea id="fragmented" name="fragmented" style={{ ...I, minHeight: 110, resize: "vertical" }} maxLength={600} defaultValue={sp("fragmented")} />
          </div>

          <div style={ROW}>
            <label htmlFor="understand" style={L}>What would you most want Psychefolio to understand about the way you work?</label>
            <textarea id="understand" name="understand" style={{ ...I, minHeight: 110, resize: "vertical" }} maxLength={600} defaultValue={sp("understand")} />
          </div>

          <div style={ROW}>
            <label htmlFor="practiceLanguage" style={L}>Is your practice English, Spanish, or bilingual?</label>
            <select id="practiceLanguage" name="practiceLanguage" style={I} defaultValue={sp("practiceLanguage")}>
              <option value="">Select…</option>
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
              <option value="bilingual">Bilingual</option>
            </select>
          </div>

          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16, lineHeight: 1.6, minHeight: 44 }}>
            <input type="checkbox" name="feedbackCalls" required style={{ marginTop: 4, width: 20, height: 20, flexShrink: 0 }} />
            <span>I can participate in three feedback calls during the first six months.</span>
          </label>

          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 24, lineHeight: 1.6, minHeight: 44 }}>
            <input type="checkbox" name="consent" required style={{ marginTop: 4, width: 20, height: 20, flexShrink: 0 }} />
            <span>I agree to receive application and product communications about Psychefolio.</span>
          </label>

          <button type="submit" className="pf-cta" style={{ width: "100%" }}>Submit application</button>

          <p style={{ marginTop: 16, fontSize: ".88rem", color: "var(--pf-slate)", textAlign: "center", lineHeight: 1.6 }}>
            Submitting this application does not reserve a seat. A seat is claimed only after acceptance, signed terms,
            and successful first payment.
          </p>
        </form>
      </div>
    </main>
  );
}
