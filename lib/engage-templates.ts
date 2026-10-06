import en from "@/messages/en/engage.json";
import es from "@/messages/es/engage.json";
import {
  DEFAULT_ENGAGE_LOCALE,
  MERGE_FIELDS,
  placeholdersIn,
  type EngageLocale,
  type MergeVars,
} from "@/lib/engage-config";

// C23-ENGAGE §3 — rendering. Both catalogs ship together (law #7) and the
// catalog is read directly, exactly as lib/signup-copy.ts explains: next-intl
// resolves a SIGNED-IN user's preference and to do that imports @/auth +
// @/lib/prisma, which a prospect (who has no user row) has no business
// dragging in. A prospect's locale is a column on their own row.
//
// A TEXT PART IS MANDATORY (§3). This module always produces one, and the
// branded HTML comes from the house <Envelope> via lib/notify.ts — there is
// exactly one email layout in this codebase and follow-up does not get its
// own.
//
// Every rendered message carries the unsubscribe line STRUCTURALLY: it is
// appended here, from the catalog, for every template, so no template can lose
// it by being edited. Verify item 11 asserts it on the rendered output.

type Catalog = typeof en;
const CATALOGS: Record<EngageLocale, Catalog> = { en, es: es as unknown as Catalog };

export type TemplateKey = keyof Catalog["engage"]["templates"];

export function engageCatalog(locale: EngageLocale): Catalog["engage"] {
  return (CATALOGS[locale] ?? CATALOGS[DEFAULT_ENGAGE_LOCALE]).engage;
}

export type RenderedMessage = {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  button: { label: string; url: string } | null;
  signoff: string;
  unsubscribe: { label: string; url: string };
  /** The plain-text part. Mandatory (§3) — never empty. */
  text: string;
};

function fill(template: string, vars: MergeVars): string {
  return template.replace(/\{(\w+)\}/g, (m, k) =>
    (MERGE_FIELDS as readonly string[]).includes(k) ? String(vars[k as keyof MergeVars] ?? "") : m,
  );
}

export function templateExists(locale: EngageLocale, key: string): boolean {
  return key in engageCatalog(locale).templates;
}

/** Every `{placeholder}` a template uses, across every string it renders —
 *  Verify item 1 proves each one is a real merge field. */
export function templatePlaceholders(locale: EngageLocale, key: string): string[] {
  const t = engageCatalog(locale).templates[key as TemplateKey];
  if (!t) return [];
  const strings = [t.subject, t.preheader, t.heading, ...t.paragraphs, t.button?.label ?? "", t.button?.url ?? ""];
  return [...new Set(strings.flatMap(placeholdersIn))];
}

export function renderEngageMessage(
  locale: EngageLocale,
  key: string,
  vars: MergeVars,
): RenderedMessage {
  const cat = engageCatalog(locale);
  const t = cat.templates[key as TemplateKey];
  if (!t) throw new Error(`engage: unknown template "${key}" for locale "${locale}"`);

  const subject = fill(t.subject, vars);
  const heading = fill(t.heading, vars);
  const paragraphs = t.paragraphs.map((p) => fill(p, vars));
  const button = t.button ? { label: fill(t.button.label, vars), url: fill(t.button.url, vars) } : null;
  const unsubLine = fill(cat.unsubscribe.line, vars);

  const text = [
    heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(button ? [`${button.label}: ${button.url}`, ""] : []),
    unsubLine,
    "",
    fill(t.signoff, vars),
  ].join("\n");

  return {
    subject,
    preheader: fill(t.preheader, vars),
    heading,
    paragraphs,
    button,
    signoff: t.signoff,
    unsubscribe: { label: cat.unsubscribe.label, url: vars.unsubscribeUrl },
    text,
  };
}
