// AMD-05 — transactional email in the recipient's language. Client-facing
// emails render from User.locale; practitioner emails stay in her language.
// Neutral Latin American Spanish (es-419), tú register (draft pending
// Valentina's voice pass — AMD-05 flag E1/E2).

export type Locale = "en" | "es";

export function pickLocale(value?: string | null): Locale {
  return value === "es" ? "es" : "en";
}

type Mail = { subject: string; text: string };

// One line that prevents most late fees (C10-POLICY §2, expectation-setting).
export const RESCHEDULE_LINE: Record<Locale, string> = {
  en: "Life happens — you can reschedule free up to 24 hours before your session.",
  es: "La vida pasa — puedes reprogramar sin costo hasta 24 horas antes de tu sesión.",
};

export function sessionEmail(
  kind: "booked" | "rescheduled" | "cancelled",
  locale: Locale,
  v: { when: string; videoUrl?: string | null },
): Mail {
  if (locale === "es") {
    if (kind === "cancelled") {
      return {
        subject: `Tu sesión del ${v.when} fue cancelada`,
        text: `Tu sesión del ${v.when} ha sido cancelada.`,
      };
    }
    return {
      subject:
        kind === "booked"
          ? `Tu sesión está confirmada — ${v.when}`
          : `Tu sesión fue actualizada — ${v.when}`,
      text:
        `Tu sesión queda para el ${v.when}.` +
        (v.videoUrl ? `\n\nÚnete aquí a la hora acordada: ${v.videoUrl}` : "") +
        `\n\n${RESCHEDULE_LINE.es}` +
        `\n\nLa invitación adjunta la agrega a tu calendario.`,
    };
  }
  if (kind === "cancelled") {
    return {
      subject: `Your session on ${v.when} was cancelled`,
      text: `Your session on ${v.when} has been cancelled.`,
    };
  }
  return {
    subject:
      kind === "booked"
        ? `Your session is confirmed — ${v.when}`
        : `Your session is updated — ${v.when}`,
    text:
      `Your session is set for ${v.when}.` +
      (v.videoUrl ? `\n\nJoin here at the time: ${v.videoUrl}` : "") +
      `\n\n${RESCHEDULE_LINE.en}` +
      `\n\nThe attached invite adds it to your calendar.`,
  };
}

// EMAIL-SPEC #10 — the 24h session reminder: time, join link, and the policy
// line (it prevents most late fees).
export function sessionReminderEmail(
  locale: Locale,
  v: { when: string; videoUrl?: string | null },
): Mail {
  if (locale === "es") {
    return {
      subject: `Tu sesión es mañana — ${v.when}`,
      text:
        `Un recordatorio suave: tu sesión con Valentina es el ${v.when}.` +
        (v.videoUrl ? `\n\nÚnete aquí a la hora acordada: ${v.videoUrl}` : "") +
        `\n\n${RESCHEDULE_LINE.es}`,
    };
  }
  return {
    subject: `Your session is tomorrow — ${v.when}`,
    text:
      `A gentle reminder: your session with Valentina is ${v.when}.` +
      (v.videoUrl ? `\n\nJoin here at the time: ${v.videoUrl}` : "") +
      `\n\n${RESCHEDULE_LINE.en}`,
  };
}

// C13 §9 — the payment reminder, warm and never a dunning notice. The invoice
// itself rides along: details in the body, the PDF attached, and ONE button
// straight to the payment page (the most important part).
export function paymentReminderEmail(
  locale: Locale,
  v: { description: string; amount: string; due?: string | null },
): Mail & { heading: string; paragraphs: string[]; buttonLabel: string } {
  if (locale === "es") {
    const paragraphs = [
      `Hola — una nota breve: hay un pago pendiente de ${v.amount} por ${v.description}.` +
        (v.due ? ` Vence el ${v.due}.` : ""),
      `La factura va adjunta en PDF, y puedes verla y pagarla en línea con el botón de abajo.`,
      `Si ya lo arreglaste con Valentina, ignora este mensaje con confianza.`,
    ];
    return {
      subject: "Una nota amable sobre tu sesión",
      heading: "Una nota amable.",
      paragraphs,
      buttonLabel: "Ver y pagar la factura",
      text: paragraphs.join("\n\n"),
    };
  }
  const paragraphs = [
    `Hi — a quick note: there's a payment of ${v.amount} waiting for ${v.description}.` +
      (v.due ? ` It's due ${v.due}.` : ""),
    `The invoice is attached as a PDF, and you can view and pay it online with the button below.`,
    `If you've already arranged this with Valentina, feel free to ignore this.`,
  ];
  return {
    subject: "A gentle note about your session",
    heading: "A gentle note.",
    paragraphs,
    buttonLabel: "View & pay the invoice",
    text: paragraphs.join("\n\n"),
  };
}

// The payee copy — a different person covers this client's bills (a parent, a
// partner, an employer). Plain, professional, still in the practice's voice.
export function payeeInvoiceEmail(
  locale: Locale,
  v: {
    kind: "invoice" | "reminder";
    payeeName: string;
    clientName: string;
    description: string;
    amount: string;
    due?: string | null;
  },
): { subject: string; heading: string; paragraphs: string[]; buttonLabel: string } {
  if (locale === "es") {
    return {
      subject:
        v.kind === "invoice"
          ? `Una factura por las sesiones de ${v.clientName} — ${v.amount}`
          : `Recordatorio de pago — sesiones de ${v.clientName}`,
      heading: v.kind === "invoice" ? "Una factura para ti." : "Un recordatorio amable.",
      paragraphs: [
        `Hola ${v.payeeName} — recibes este mensaje como contacto de facturación de ${v.clientName}.`,
        `${v.kind === "invoice" ? "Hay una factura" : "Hay una factura pendiente"} de ${v.amount} por ${v.description}.` +
          (v.due ? ` Vence el ${v.due}.` : ""),
        `La factura va adjunta en PDF, y puede pagarse en línea con el botón de abajo.`,
      ],
      buttonLabel: "Ver y pagar la factura",
    };
  }
  return {
    subject:
      v.kind === "invoice"
        ? `An invoice for ${v.clientName}'s sessions — ${v.amount}`
        : `Payment reminder — ${v.clientName}'s sessions`,
    heading: v.kind === "invoice" ? "An invoice for you." : "A gentle reminder.",
    paragraphs: [
      `Hello ${v.payeeName} — you're receiving this as the billing contact for ${v.clientName}.`,
      `${v.kind === "invoice" ? "There's an invoice" : "There's an open invoice"} of ${v.amount} for ${v.description}.` +
        (v.due ? ` It's due ${v.due}.` : ""),
      `The invoice is attached as a PDF, and it can be paid online with the button below.`,
    ],
    buttonLabel: "View & pay the invoice",
  };
}

// C13-PKG §6 — the renewal moment. A relationship moment, not a subscription
// lapse: never "your credits expired — buy now."
export function packageCompletedEmail(
  locale: Locale,
  v: { sessionsTotal: number },
): Mail {
  if (locale === "es") {
    return {
      subject: "Esa fue la última sesión de tu paquete",
      text:
        `Acaban de completar las ${v.sessionsTotal} sesiones de tu paquete — un recorrido que vale la pena reconocer.\n\n` +
        `Cuando estés lista o listo para continuar, en tu espacio (Sesiones → «Continuar nuestro trabajo») ` +
        `encontrarás las opciones. Sin prisa — este trabajo va a tu ritmo.`,
    };
  }
  return {
    subject: "That was the last session of your package",
    text:
      `You've just completed all ${v.sessionsTotal} sessions of your package — a journey worth pausing to honor.\n\n` +
      `Whenever you're ready to continue, you'll find the options in your space under Sessions → "Continue our work". ` +
      `No rush — this work moves at your pace.`,
  };
}

// BILLING-DASH — her one-tap renewal email: warm, her package options listed,
// one button to the portal. A relationship note, never a subscription lapse.
export function renewalEmail(
  locale: Locale,
  v: { packages: { name: string; amount: string; sessions: number | null }[] },
): { subject: string; heading: string; paragraphs: string[]; buttonLabel: string } {
  const listEn = v.packages
    .map((p) => `${p.name} — ${p.amount}${p.sessions ? ` (${p.sessions} sessions)` : ""}`)
    .join(" · ");
  const listEs = listEn;
  if (locale === "es") {
    return {
      subject: "Cuando quieras continuar",
      heading: "Cuando quieras continuar.",
      paragraphs: [
        "Completaste las sesiones de tu paquete — un recorrido que vale la pena reconocer.",
        ...(v.packages.length
          ? [`Si te llama seguir, estas son las opciones: ${listEs}.`]
          : []),
        "Las encuentras en tu espacio, en Sesiones → «Continuar nuestro trabajo». Sin prisa — este trabajo va a tu ritmo.",
      ],
      buttonLabel: "Ver mis opciones",
    };
  }
  return {
    subject: "Whenever you're ready to continue",
    heading: "Whenever you're ready.",
    paragraphs: [
      "You've completed the sessions in your package — a journey worth pausing to honor.",
      ...(v.packages.length
        ? [`If continuing calls to you, here are the options: ${listEn}.`]
        : []),
      'You\'ll find them in your space under Sessions → "Continue our work". No rush — this work moves at your pace.',
    ],
    buttonLabel: "See my options",
  };
}

// C10-POLICY §6 — the fee, stated plainly once, with its reason.
export function lateFeeEmail(
  locale: Locale,
  v: { amount: string; reason: "LATE_RESCHEDULE" | "LATE_CANCEL" | "NO_SHOW" },
): Mail & { buttonLabel: string } {
  const reasonEn =
    v.reason === "NO_SHOW"
      ? "a missed session"
      : v.reason === "LATE_CANCEL"
        ? "a cancellation less than 24 hours before your session"
        : "a reschedule less than 24 hours before your session";
  const reasonEs =
    v.reason === "NO_SHOW"
      ? "una sesión a la que no fue posible asistir"
      : v.reason === "LATE_CANCEL"
        ? "una cancelación con menos de 24 horas de anticipación"
        : "una reprogramación con menos de 24 horas de anticipación";
  if (locale === "es") {
    return {
      subject: "Sobre el cambio de tu sesión",
      text:
        `Como la política de la práctica indica, se aplicó un cargo de ${v.amount} por ${reasonEs}.\n\n` +
        `Puedes resolverlo con el botón de abajo, o desde tu espacio en Sesiones. Si algo urgente ocurrió, escríbele a Valentina — siempre hay espacio para conversar.`,
      buttonLabel: "Resolverlo en línea",
    };
  }
  return {
    subject: "About your session change",
    text:
      `Per the practice policy, a ${v.amount} fee was applied for ${reasonEn}.\n\n` +
      `You can settle it with the button below, or from your space under Sessions. If something urgent came up, message Valentina — there's always room for a conversation.`,
    buttonLabel: "Settle it online",
  };
}

// EMAIL-SPEC #12 — the warm receipt (ours; covers in-portal and invoice payments).
export function receiptEmail(
  locale: Locale,
  v: { description: string; amount: string },
): Mail {
  if (locale === "es") {
    return {
      subject: "Recibido, con gracias",
      text:
        `Tu pago de ${v.amount} (${v.description}) llegó bien.\n\n` +
        `No necesitas hacer nada más — esto es solo tu constancia, para tus registros.`,
    };
  }
  return {
    subject: "Received, with thanks",
    text:
      `Your payment of ${v.amount} (${v.description}) came through.\n\n` +
      `Nothing more to do — this is simply your record of it.`,
  };
}

// EMAIL-SPEC — the invoice email is OURS (Square hosts only the payment page).
export function invoiceEmail(
  locale: Locale,
  v: { description: string; amount: string; note?: string | null },
): { subject: string; heading: string; paragraphs: string[]; buttonLabel: string } {
  if (locale === "es") {
    return {
      subject: `Una factura de Valentina — ${v.amount}`,
      heading: "Tu factura está lista.",
      paragraphs: [
        `Valentina te envió una factura por ${v.amount} — ${v.description}.`,
        "Puedes pagarla en línea con el botón de abajo, cuando te venga bien.",
      ],
      buttonLabel: "Ver y pagar la factura",
    };
  }
  return {
    subject: `An invoice from Valentina — ${v.amount}`,
    heading: "Your invoice is ready.",
    paragraphs: [
      `Valentina sent you an invoice for ${v.amount} — ${v.description}.`,
      "You can view and pay it online with the button below, whenever suits you.",
    ],
    buttonLabel: "View & pay the invoice",
  };
}

// AMD-05 B2 — verified email change: link to the NEW address…
export function emailChangeVerifyEmail(locale: Locale, v: { link: string }): Mail {
  if (locale === "es") {
    return {
      subject: "Confirma tu nueva dirección de correo",
      text:
        `Pediste cambiar el correo de tu cuenta a esta dirección.\n\n` +
        `Confírmalo aquí (el enlace vence en 24 horas):\n${v.link}\n\n` +
        `Si no fuiste tú, ignora este mensaje — nada cambia sin esta confirmación.`,
    };
  }
  return {
    subject: "Confirm your new email address",
    text:
      `You asked to change your account email to this address.\n\n` +
      `Confirm it here (the link expires in 24 hours):\n${v.link}\n\n` +
      `If this wasn't you, ignore this message — nothing changes without this confirmation.`,
  };
}

// …and the tripwire notice to the OLD address.
export function emailChangeNoticeEmail(locale: Locale, v: { newEmail: string }): Mail {
  if (locale === "es") {
    return {
      subject: "Se solicitó un cambio de correo en tu cuenta",
      text:
        `Alguien pidió cambiar el correo de tu cuenta a ${v.newEmail}.\n\n` +
        `Si fuiste tú, no necesitas hacer nada — el cambio solo ocurre al confirmar desde la nueva dirección.\n\n` +
        `Si NO fuiste tú, cambia tu contraseña ahora mismo y avísale a Valentina.`,
    };
  }
  return {
    subject: "An email change was requested on your account",
    text:
      `Someone requested changing your account email to ${v.newEmail}.\n\n` +
      `If this was you, nothing more is needed — the change only happens when confirmed from the new address.\n\n` +
      `If this was NOT you, change your password right away and let Valentina know.`,
  };
}

// AMD-05 B3 — deletion request acknowledged, with the stated timeline.
export function deletionRequestAckEmail(locale: Locale): Mail {
  if (locale === "es") {
    return {
      subject: "Recibimos tu solicitud de eliminación",
      text:
        `Recibimos tu solicitud de eliminar tu información.\n\n` +
        `Valentina la revisará contigo directamente — este tipo de decisión merece una conversación humana. ` +
        `Recibirás una respuesta dentro de los próximos 7 días, y la eliminación se completa dentro de 30 días de confirmarse.\n\n` +
        `Mientras tanto, puedes descargar una copia de tu información desde Ajustes → Tu registro.`,
    };
  }
  return {
    subject: "We received your deletion request",
    text:
      `We received your request to delete your information.\n\n` +
      `Valentina will review it with you directly — a decision like this deserves a human conversation. ` +
      `You'll hear back within 7 days, and deletion completes within 30 days of confirmation.\n\n` +
      `In the meantime, you can download a copy of your information from Settings → Your record.`,
  };
}
