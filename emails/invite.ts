import type { EnvelopeInput } from "@/emails/envelope";

// EMAIL-SPEC #1 — the flagship: "Valentina has invited you." Two warm lines,
// one button, the expiry whisper, her optional personal note in her voice.

export function inviteEmail(args: {
  locale: "en" | "es";
  firstName: string;
  link: string;
  note?: string | null;
}): { subject: string; envelope: EnvelopeInput } {
  const { locale, firstName, link, note } = args;
  if (locale === "es") {
    return {
      subject: "Estás invitada — Valentina Vélez",
      envelope: {
        locale,
        preheader:
          "Valentina abrió un espacio privado para su trabajo juntas — acepta tu invitación cuando estés lista.",
        heading: `${firstName}, tu espacio está listo.`,
        paragraphs: [
          "Valentina te ha invitado a su portal privado de clientes — un lugar tranquilo para el trabajo que harán juntas: tus reflexiones, tus sesiones y todo lo que descubras en el camino.",
          "Toma unos dos minutos configurarlo, y todo lo que hay dentro queda entre tú y ella.",
        ],
        note: note || null,
        button: { label: "Aceptar tu invitación", url: link },
        whisper:
          "Esta invitación es solo para ti y descansa después de 7 días — Valentina siempre puede enviarte una nueva.",
      },
    };
  }
  return {
    subject: "You're invited — Valentina Vélez",
    envelope: {
      locale,
      preheader:
        "Valentina has opened a private space for your work together — accept your invitation when you're ready.",
      heading: `${firstName}, your space is ready.`,
      paragraphs: [
        "Valentina has invited you into her private client portal — a calm place for the work you'll do together: your reflections, your sessions, and everything you discover along the way.",
        "It takes about two minutes to set up, and everything in it stays between you and her.",
      ],
      note: note || null,
      button: { label: "Accept your invitation", url: link },
      whisper:
        "This invitation is just for you and rests after 7 days — Valentina can always send a fresh one.",
    },
  };
}
