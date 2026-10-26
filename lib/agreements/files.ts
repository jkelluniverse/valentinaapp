import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { putObject, getObject } from "@/lib/storage";

// C21 — uploaded document files. Bytes go through the storage adapter
// (same local-driver/R2 seam as sealed PDFs and session audio); every row
// carries the SHA-256 of its bytes, every read re-verifies it, and the
// signature certificate freezes the hash of every file in a request.

export const MAX_AGREEMENT_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "image/png": ".png",
  "image/jpeg": ".jpg",
};

export async function saveAgreementFile(args: {
  tenantId: string;
  bytes: Buffer;
  filename: string;
  contentType: string;
  templateId?: string;
  agreementId?: string;
}): Promise<{ ok: true; fileId: string } | { ok: false; error: string }> {
  if (args.bytes.length === 0) return { ok: false, error: "empty file" };
  if (args.bytes.length > MAX_AGREEMENT_FILE_BYTES) return { ok: false, error: "file too large (15 MB max)" };
  if (!ALLOWED_UPLOAD_TYPES[args.contentType]) return { ok: false, error: `unsupported file type: ${args.contentType}` };
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  const safeName = args.filename.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "document";
  const key = `agreements/uploads/${args.tenantId}/${sha256.slice(0, 16)}-${safeName}`;
  putObject(key, args.bytes);
  const row = await prisma.agreementFile.create({
    data: {
      tenantId: args.tenantId,
      templateId: args.templateId ?? null,
      agreementId: args.agreementId ?? null,
      filename: safeName,
      contentType: args.contentType,
      size: args.bytes.length,
      sha256,
      key,
    },
    select: { id: true },
  });
  return { ok: true, fileId: row.id };
}

// Freeze a template's files onto a sent agreement: new rows, same stored
// bytes (content-addressed keys make the bytes immutable per hash).
export async function copyTemplateFilesToAgreement(templateId: string, agreementId: string, tenantId: string): Promise<number> {
  const files = await prisma.agreementFile.findMany({ where: { templateId } });
  for (const f of files) {
    await prisma.agreementFile.create({
      data: {
        tenantId,
        agreementId,
        filename: f.filename,
        contentType: f.contentType,
        size: f.size,
        sha256: f.sha256,
        key: f.key,
      },
    });
  }
  return files.length;
}

export async function agreementFiles(agreementId: string) {
  return prisma.agreementFile.findMany({ where: { agreementId }, orderBy: { createdAt: "asc" } });
}

export async function templateFiles(templateId: string) {
  return prisma.agreementFile.findMany({ where: { templateId }, orderBy: { createdAt: "asc" } });
}

// Tamper-evident read: bytes must still hash to the recorded sha256.
export async function readAgreementFileVerified(
  fileId: string
): Promise<
  | { ok: true; bytes: Buffer; filename: string; contentType: string; agreementId: string | null; templateId: string | null }
  | { ok: false; reason: "missing" | "tampered" }
> {
  const f = await prisma.agreementFile.findFirst({ where: { id: fileId } });
  if (!f) return { ok: false, reason: "missing" };
  const bytes = getObject(f.key);
  if (!bytes) return { ok: false, reason: "missing" };
  if (createHash("sha256").update(bytes).digest("hex") !== f.sha256) return { ok: false, reason: "tampered" };
  return { ok: true, bytes, filename: f.filename, contentType: f.contentType, agreementId: f.agreementId, templateId: f.templateId };
}
