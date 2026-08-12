import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { saveAgreementFile, templateFiles } from "./files";

// C21 — the dispute-packet installer (files_7.zip, Aug 2026). Four
// documents, three signing patterns:
//   1. Client Declaration — the past client signs; her blanks are fillable
//      fields inline in the document (TEXT template, single signature).
//   2. Memorandum of Family Services Arrangement — dual signature: the
//      client signs, Valentina countersigns with her stored mark.
//   3. Session Recording Log (Exhibit C) — branded PDF, practitioner-only
//      ("Prepared by"): FILES template, self-sign.
//   4. Square Dispute Narrative — branded PDF, practitioner-only: FILES
//      template, self-sign. Goes to Square, not to a client.
// Document text is VERBATIM from Jacob's packet; the only change is that
// each fill-in blank ("______") became a {{fill:*}} marker so the signer
// completes it in the flow, and the paper signature-line scaffolding is
// replaced by the e-sign ceremony itself (typed name + drawn mark +
// timestamps + sealed certificate). Installed ACTIVE: Jacob's instruction
// is to use these now (Square response deadlines Aug 9–10).

export const DECLARATION_SLUG = "client-declaration";
export const MEMORANDUM_SLUG = "family-services-memorandum";
export const RECORDING_LOG_SLUG = "session-recording-log";
export const NARRATIVE_SLUG = "square-dispute-narrative";
export const PAYMENT_AUTH_SLUG = "payment-authorization-es";

// AUTORIZACIÓN DE PAGO (Aug 2026 upload) — the payee's recurring-charge
// authorization, Spanish. Signed via a DIRECT SIGN LINK (the client
// forwards it to their payer; no email needed). Text VERBATIM from the
// upload. DELIBERATE: the account/card-number blanks stay literal blanks
// — full card numbers, security codes, and bank account numbers must
// NEVER enter this system (PCI: no PAN/CVV at rest; the form itself says
// data lives in Square). What signs here is the AUTHORIZATION — name,
// frequency, chosen method, the NSF terms, signature; the instrument
// details go into Square's secure card-on-file, or on paper.
const PAYMENT_AUTH_BODY = `AUTORIZACIÓN DE PAGO EN NOMBRE PROPIO O DE TERCERO

[ ] Cargo Recurrente – Yo, {{fill:nombre_autorizante}}, autorizo a VIIIV CORP a establecer mis cargos regulares, programados o recurrentes a mi tarjeta de crédito o cuenta bancaria. Se me cobrará el monto indicado en mi acuerdo de servicios. Acepto que no se enviará notificación previa a menos que el monto cambie, en cuyo caso recibiré un aviso de nuestra parte antes de que se procese el cobro.

Deseo que mis pagos se procesen automáticamente. Usted o la oficina pueden aún modificar este calendario o programar transacciones únicas en línea.

[ ] Mensual, el día {{fill:dia_del_mes}} del mes.

[ ] Semanal, el día {{fill:dia_de_la_semana}} de la semana.

(Seleccione el Método de Pago Predeterminado) Ambas opciones pueden agregarse como métodos de pago. En caso de cambio, puede notificar a la oficina para usar su método de pago alternativo.

[ ] Pago por Banco (ACH)
Número de Cuenta:_______________________ Nombre del Banco: ______________________
Número de Ruta (Routing):_______________________
(siempre 9 dígitos)

[ ] Pago con Tarjeta
Tipo de tarjeta: __________________________ Número: ____________________________
Vencimiento:__________________________ Código de Seguridad:______________________

(Toda la información personal se almacena de forma segura en el procesador de pagos Square).

Si necesita cambiar su pago automático programado, por favor notifique a la oficina con al menos 48 horas de anticipación a la fecha programada. No nos hacemos responsables de posibles cargos por pagos devueltos si no se nos notifica a tiempo.

FONDOS INSUFICIENTES (NSF) / DISPUTAS

Entiendo que esta autorización permanecerá vigente hasta que yo la cancele por escrito, y me comprometo a notificar por escrito al comerciante cualquier cambio en la información de mi cuenta o la terminación de esta autorización con al menos 15 días de anticipación a la siguiente fecha de cobro. Si las fechas de pago indicadas arriba caen en fin de semana o día festivo, entiendo que los pagos podrán ejecutarse el siguiente día hábil. Respecto de los débitos ACH a mi cuenta corriente o de ahorros, entiendo que, por tratarse de transacciones electrónicas, estos fondos podrán retirarse de mi cuenta. En caso de que una transacción ACH sea rechazada por Fondos Insuficientes (NSF), entiendo que el comerciante podrá, a su discreción, intentar procesar el cargo nuevamente dentro de los 30 días siguientes, y acepto un cargo adicional de $55.00 por cada intento devuelto por NSF, el cual se iniciará como una transacción separada del pago recurrente autorizado. Reconozco que la originación de transacciones ACH a mi cuenta debe cumplir con las disposiciones de la ley de los Estados Unidos.

Certifico que soy un usuario autorizado de esta tarjeta de crédito/cuenta bancaria y que no disputaré estas transacciones programadas ante mi banco o compañía de tarjeta de crédito, siempre que las transacciones correspondan a los términos indicados en este formulario de autorización.

VIIIV CORP (d/b/a Veritas Consulting) · Orlando, Florida`;

const PAYMENT_AUTH_ITEMS = [
  { id: "cargo-recurrente", text: "Cargo Recurrente — autorizo a VIIIV CORP a establecer mis cargos regulares, programados o recurrentes a mi tarjeta de crédito o cuenta bancaria.", kind: "checkbox", required: true },
  { id: "nombre_autorizante", text: "Su nombre completo (quien autoriza)", kind: "text", required: true },
  { id: "frecuencia", text: "Frecuencia elegida: Mensual o Semanal", kind: "text", required: true },
  { id: "dia_del_mes", text: "Si es mensual: día del mes", kind: "text", required: false },
  { id: "dia_de_la_semana", text: "Si es semanal: día de la semana", kind: "text", required: false },
  { id: "metodo_pago", text: "Método de pago predeterminado: Banco (ACH) o Tarjeta — los datos de la cuenta o tarjeta NO se escriben aquí; se registran de forma segura en Square", kind: "text", required: true },
];

export async function installPaymentAuthorization(tenantId: string): Promise<{ installed: boolean }> {
  const exists = await prisma.agreementTemplate.findFirst({
    where: { tenantId, slug: PAYMENT_AUTH_SLUG, version: 1, locale: "es" },
    select: { id: true },
  });
  if (exists) return { installed: false };
  await prisma.agreementTemplate.create({
    data: {
      tenantId,
      slug: PAYMENT_AUTH_SLUG,
      kind: "TEXT",
      version: 1,
      locale: "es",
      title: "Autorización de Pago en Nombre Propio o de Tercero",
      body: PAYMENT_AUTH_BODY,
      initialItems: PAYMENT_AUTH_ITEMS,
      requiresCountersign: false,
      status: "ACTIVE",
      placeholder: false,
    },
  });
  return { installed: true };
}

const DECLARATION_BODY = `DECLARATION OF {{fill:declarant_full_name}}

Signed statement of the client and parent of the minor service recipients.

I, {{fill:declarant_full_name}}, state the following based on my personal knowledge:

The Arrangement

1. In or about {{fill:enrollment_month}} 2025, I enrolled myself and my two children (initials {{fill:child1_initials}}, age {{fill:child1_age}}, and {{fill:child2_initials}}, age {{fill:child2_age}}) in an ongoing family-services arrangement with Valentina Vélez of VIIIV CORP (d/b/a Veritas Consulting) for non-clinical personal-development services.

2. The agreed price was $450.00 per week of active service, representing the equivalent of three sessions at $150.00 each, which my children and I could use interchangeably. Our use varied from week to week: some weeks one of us received more sessions and another fewer or none, depending on our needs and schedules.

3. My children and I received services regularly and continuously under this arrangement from approximately {{fill:services_start_month}} 2025 through July 2026. The services we paid for were genuinely and consistently provided.

The Payment Arrangement

4. In or about {{fill:payment_agreement_month}} 2025, {{fill:cardholder_full_name}}, my former spouse and the father of my children, agreed to pay for these family services and provided his credit card for that purpose. [Describe briefly how the agreement was communicated — e.g., "he told me by text message on or about ______" / "we discussed it by phone and he confirmed"]: {{fill:agreement_communication}}.

5. Consistent with that agreement, twelve charges of $450.00 each were made to his card between April 8, 2026 and July 24, 2026, on the following dates: April 8, April 15, April 22, May 9, May 13, May 22, June 11, June 18, June 26, July 10, July 17, and July 24, 2026.

6. I was aware of these charges as they occurred, kept track of the payment dates myself, and understood each charge to be a legitimate payment under our family-services arrangement. At no time before the disputes described below did he tell me he objected to the charges, ask that the services stop, or state that he was withdrawing his agreement to pay.

The Disputes

7. I understand that all twelve charges have now been disputed with the card issuer. I am the recipient of the services those charges paid for, together with my children, and I do not dispute any of them. Every disputed charge corresponds to our continuing family-services arrangement, under which services were actually and regularly delivered to my family.

8. I have reviewed the session recording log prepared from VIIIV CORP's session-audio archive, and it is consistent with my family's actual participation as I remember it.

I declare that the statements above are true and correct to the best of my knowledge.

ATTACH (IF AVAILABLE)
Screenshots or copies of any message, email, or other written communication in which the cardholder agreed to pay for the family's services or acknowledged the payment arrangement. A contemporaneous written trace of his agreement is the single strongest exhibit this packet can contain.

VIIIV CORP (d/b/a Veritas Consulting) · Orlando, Florida · Coaching — not medical or psychological treatment`;

const DECLARATION_ITEMS = [
  { id: "declarant_full_name", text: "Your full legal name", kind: "text", required: true },
  { id: "enrollment_month", text: "Month you enrolled (e.g. December)", kind: "text", required: true },
  { id: "child1_initials", text: "First child's initials", kind: "text", required: true },
  { id: "child1_age", text: "First child's age", kind: "text", required: true },
  { id: "child2_initials", text: "Second child's initials", kind: "text", required: true },
  { id: "child2_age", text: "Second child's age", kind: "text", required: true },
  { id: "services_start_month", text: "Month services began (e.g. December)", kind: "text", required: true },
  { id: "payment_agreement_month", text: "Month the payment agreement was made (e.g. December)", kind: "text", required: true },
  { id: "cardholder_full_name", text: "Full name of your former spouse (the cardholder)", kind: "text", required: true },
  { id: "agreement_communication", text: "How the payment agreement was communicated", kind: "text", required: true, multiline: true },
];

const MEMORANDUM_BODY = `MEMORANDUM OF FAMILY SERVICES ARRANGEMENT

Executed as of the date below to memorialize a previously existing oral arrangement.

This Memorandum is made between VIIIV CORP (d/b/a Veritas Consulting), operated by Valentina Vélez ("the Practice"), and {{fill:client_full_name}} ("Client"). It records, in writing, the terms of an ongoing family-services arrangement that the Client and the Practice entered into orally in or about {{fill:arrangement_month}} 2025 and operated under through July 2026.

1. The Arrangement as the Parties Understood It

1.1. The Client enrolled herself and her two minor children (initials {{fill:child1_initials}} and {{fill:child2_initials}}) in an ongoing, customized family-services arrangement with the Practice for non-clinical personal-development services.

1.2. The agreed price was $450.00 per week of active service, representing the equivalent of three (3) sessions at $150.00 each, available to the family collectively.

1.3. The three weekly session-equivalents were interchangeable among the Client and her children: in any given week one family member might receive two sessions, another one, and another none, with the distribution varying according to the family's needs and scheduling.

1.4. Each weekly charge accordingly represented the family's continuing service arrangement for that week — not a representation that exactly one session occurred with each family member in that week.

1.5. The Practice did not bill for every calendar week: charges were made only for weeks of active service, and billing paused when services paused. The charge record between April 8, 2026 and July 24, 2026 (twelve charges across approximately sixteen calendar weeks) reflects this practice.

1.6. Services under this arrangement were scheduled by message with the family and delivered regularly; in the ordinary course of its work, the Practice recorded sessions, and its session-audio archive documents the services delivered. A log compiled from that archive accompanies this Memorandum.

2. Payment

2.1. Fees under the arrangement were charged by card through the Practice's payment processor (Square), in twelve charges of $450.00 each, on the dates listed in the accompanying records, using a card provided for that purpose as arranged by the Client. The Client's separate signed Declaration addresses the payment arrangement in detail.

3. Nature of This Document

3.1. This Memorandum is executed on the date below. It is not backdated, and it is not represented to be a document that existed before the charges described above. Its sole purpose is to accurately memorialize, in writing, the oral arrangement under which the parties actually operated.

3.2. This Memorandum creates no new terms retroactively and modifies nothing; future services, if any, will be governed by the Practice's current written Client Services Agreement.

3.3. The services described are coaching and personal-development services — not medical or psychological treatment.

Each signer confirms that the statements above accurately reflect the arrangement as they understood and operated under it.

VIIIV CORP (d/b/a Veritas Consulting) · Orlando, Florida · Coaching — not medical or psychological treatment`;

const MEMORANDUM_ITEMS = [
  { id: "client_full_name", text: "Your full legal name", kind: "text", required: true },
  { id: "arrangement_month", text: "Month the arrangement began (e.g. December)", kind: "text", required: true },
  { id: "child1_initials", text: "First child's initials", kind: "text", required: true },
  { id: "child2_initials", text: "Second child's initials", kind: "text", required: true },
];

const FILE_TEMPLATES = [
  {
    slug: RECORDING_LOG_SLUG,
    title: "Exhibit C — Session Recording Log",
    repoFile: "session-recording-log.pdf",
    body: 'The attached branded document is Exhibit C — the session recording log compiled from the Practice\'s session-audio archive. Review the attached document; signing below signs as "Prepared by" with the date applied automatically.',
  },
  {
    slug: NARRATIVE_SLUG,
    title: "Dispute Response — Statement of the Merchant",
    repoFile: "square-dispute-narrative.pdf",
    body: "The attached branded document is the master dispute narrative for the twelve related Square disputes. Review the attached document; signing below signs the statement with the date applied automatically.",
  },
];

export async function installDisputePacket(tenantId: string): Promise<{ installed: string[]; skipped: string[] }> {
  const installed: string[] = [];
  const skipped: string[] = [];

  const textTemplates = [
    { slug: DECLARATION_SLUG, title: "Declaration — Family Services & Payment Arrangement", body: DECLARATION_BODY, items: DECLARATION_ITEMS, countersign: false },
    { slug: MEMORANDUM_SLUG, title: "Memorandum of Family Services Arrangement", body: MEMORANDUM_BODY, items: MEMORANDUM_ITEMS, countersign: true },
  ];
  for (const t of textTemplates) {
    const exists = await prisma.agreementTemplate.findFirst({ where: { tenantId, slug: t.slug, version: 1, locale: "en" }, select: { id: true } });
    if (exists) {
      skipped.push(t.slug);
      continue;
    }
    await prisma.agreementTemplate.create({
      data: {
        tenantId,
        slug: t.slug,
        kind: "TEXT",
        version: 1,
        locale: "en",
        title: t.title,
        body: t.body,
        initialItems: t.items,
        requiresCountersign: t.countersign,
        status: "ACTIVE",
        placeholder: false,
      },
    });
    installed.push(t.slug);
  }

  for (const t of FILE_TEMPLATES) {
    const exists = await prisma.agreementTemplate.findFirst({ where: { tenantId, slug: t.slug, version: 1, locale: "en" }, select: { id: true } });
    if (exists) {
      // Template row exists; make sure its file made it in (idempotent repair).
      if ((await templateFiles(exists.id)).length > 0) {
        skipped.push(t.slug);
        continue;
      }
      const bytes = readFileSync(join(process.cwd(), "content/agreements/files", t.repoFile));
      await saveAgreementFile({ tenantId, bytes, filename: t.repoFile, contentType: "application/pdf", templateId: exists.id });
      installed.push(`${t.slug} (file repaired)`);
      continue;
    }
    const tpl = await prisma.agreementTemplate.create({
      data: {
        tenantId,
        slug: t.slug,
        kind: "FILES",
        version: 1,
        locale: "en",
        title: t.title,
        body: t.body,
        requiresCountersign: false,
        status: "ACTIVE",
        placeholder: false,
      },
    });
    const bytes = readFileSync(join(process.cwd(), "content/agreements/files", t.repoFile));
    await saveAgreementFile({ tenantId, bytes, filename: t.repoFile, contentType: "application/pdf", templateId: tpl.id });
    installed.push(t.slug);
  }

  return { installed, skipped };
}
