import { SignatureRule, Eyebrow } from "@/components/brand";

export const metadata = { title: "Privacy notice" };

// Minimal C1 privacy notice so consent is informed. Expanded alongside the
// retention/deletion policy in a later component (per the charter). Now inside
// the public marketing frame (C18), so no min-h-screen of its own.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-6 px-5 py-16 md:px-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your privacy</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Privacy notice</h1>
        <SignatureRule />
      </div>
      <div className="flex flex-col gap-4 text-lg leading-relaxed text-ink">
        <p>
          This is a private space for reflection between you and Valentina. What you record
          here is personal, and we treat it that way.
        </p>
        <p>
          <span className="font-medium text-ink-strong">What we store.</span> Your name, email,
          and the reflections you choose to write. Your password is never stored — only a
          securely hashed version of it.
        </p>
        <p>
          <span className="font-medium text-ink-strong">Who can see it.</span> Only you and
          Valentina. Your space is yours; other clients can never see it.
        </p>
        <p>
          <span className="font-medium text-ink-strong">Consent and access.</span> You choose to
          join, and you can ask Valentina to deactivate your account at any time. A full
          retention and deletion policy is documented as the platform grows.
        </p>
        <p>
          <span className="font-medium text-ink-strong">AI-assisted preparation.</span> With your
          consent, Valentina may use a private AI assistant to review your reflections when
          preparing for your sessions. Your name and email are never shared with it, nothing it
          produces is shown to anyone but Valentina, and your data is never used to train AI.
          You can turn this on or off anytime from your space.
        </p>
        <p>
          <span className="font-medium text-ink-strong">Security.</span> Data is encrypted in
          transit, passwords are hashed, and access is limited to your own space.
        </p>
      </div>
    </main>
  );
}
