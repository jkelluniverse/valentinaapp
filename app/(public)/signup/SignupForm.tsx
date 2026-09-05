"use client";

import { useEffect, useMemo, useState } from "react";
import { PendingButton } from "@/components/PendingButton";

// C23-SIGNUP §3 — the form. Phone-first and one-handed: single column, big
// targets, no step wizard, nothing to scroll back for. Every check here is a
// COURTESY — the server re-decides all of it (§4).

type Copy = {
  fields: Record<string, string>;
  slugStatus: Record<string, string>;
  submit: string;
  submitting: string;
  footnote: string;
  signInInstead: string;
};

export function SignupForm({
  copy,
  lang,
  passwordMin,
  action,
  refCode,
  initial,
}: {
  copy: Copy;
  lang: "en" | "es";
  passwordMin: number;
  action: (formData: FormData) => void | Promise<void>;
  refCode?: string;
  initial: { name: string; practiceName: string; email: string; slug: string };
}) {
  const [practiceName, setPracticeName] = useState(initial.practiceName);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [verdict, setVerdict] = useState<"idle" | "checking" | "ok" | "taken" | "reserved" | "invalid">("idle");
  const [renderedAt, setRenderedAt] = useState(0);
  useEffect(() => setRenderedAt(Date.now()), []);

  // Prefill the address by slugifying the practice name, until they edit it.
  const suggestion = useMemo(
    () =>
      practiceName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 31)
        .replace(/-+$/g, ""),
    [practiceName],
  );
  const effectiveSlug = slugTouched ? slug : suggestion;

  // Live availability. Debounced; purely advisory.
  useEffect(() => {
    if (!effectiveSlug) {
      setVerdict("idle");
      return;
    }
    setVerdict("checking");
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/signup/slug?slug=${encodeURIComponent(effectiveSlug)}`);
        const data = (await res.json()) as { verdict?: string };
        setVerdict(
          data.verdict === "ok" || data.verdict === "taken" || data.verdict === "reserved" || data.verdict === "invalid"
            ? data.verdict
            : "idle",
        );
      } catch {
        setVerdict("idle");
      }
    }, 450);
    return () => clearTimeout(id);
  }, [effectiveSlug]);

  const field =
    "w-full rounded-lg border border-line bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors focus:border-wine focus:ring-2 focus:ring-wine/20";
  const label = "flex flex-col gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-mocha";
  const hint = "text-[13px] leading-relaxed text-slate";

  const statusText =
    verdict === "checking"
      ? copy.slugStatus.checking
      : verdict === "ok"
        ? copy.slugStatus.ok
        : verdict === "taken"
          ? copy.slugStatus.taken
          : verdict === "reserved"
            ? copy.slugStatus.reserved
            : verdict === "invalid"
              ? copy.slugStatus.invalid
              : "";

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="ref" value={refCode ?? ""} />
      <input type="hidden" name="source" value={refCode ? "referral" : "web"} />
      <input type="hidden" name="t" value={renderedAt} />
      {/* honeypot — visually and semantically hidden; a human never fills it */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className={label}>
        {copy.fields.name}
        <input
          name="name"
          required
          autoComplete="name"
          defaultValue={initial.name}
          placeholder={copy.fields.namePlaceholder}
          className={field}
        />
      </label>

      <label className={label}>
        {copy.fields.practiceName}
        <input
          name="practiceName"
          required
          autoComplete="organization"
          value={practiceName}
          onChange={(e) => setPracticeName(e.target.value)}
          placeholder={copy.fields.practiceNamePlaceholder}
          className={field}
        />
      </label>

      <label className={label}>
        {copy.fields.email}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          defaultValue={initial.email}
          placeholder={copy.fields.emailPlaceholder}
          className={field}
        />
      </label>

      <label className={label}>
        {copy.fields.password}
        <input
          name="password"
          type="password"
          required
          minLength={passwordMin}
          autoComplete="new-password"
          className={field}
        />
        <span className={hint}>{copy.fields.passwordHint}</span>
      </label>

      <label className={label}>
        {copy.fields.slug}
        <span className="flex items-center gap-2">
          <input
            name="slug"
            required
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            pattern="[a-z0-9][a-z0-9-]{1,30}"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            className={field}
          />
        </span>
        <span className={hint}>{copy.fields.slugHint}</span>
        <span
          aria-live="polite"
          className={`min-h-[1.25rem] text-[13px] font-medium ${
            verdict === "ok" ? "text-wine" : verdict === "checking" || verdict === "idle" ? "text-whisper" : "text-wine"
          }`}
        >
          {statusText}
        </span>
      </label>

      <PendingButton
        pendingLabel={copy.submitting}
        className="mt-1 rounded-pill bg-wine px-7 py-3.5 text-[15px] font-semibold text-white shadow-soft transition-colors hover:bg-wine-dark"
      >
        {copy.submit}
      </PendingButton>
      <p className={hint}>{copy.footnote}</p>
    </form>
  );
}
