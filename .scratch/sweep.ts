import { Prisma } from "@prisma/client";
import { SCOPED_MODELS } from "../lib/tenancy/scope";
const dk = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
const byKey = new Map(Prisma.dmmf.datamodel.models.map((m) => [dk(m.name), m]));
console.log("scoped models:", SCOPED_MODELS.length);
const noId: string[] = [];
const idNotPk: string[] = [];
const compoundPk: string[] = [];
for (const s of SCOPED_MODELS) {
  const m = byKey.get(s);
  if (!m) { console.log("MISSING FROM DMMF:", s); continue; }
  const hasId = m.fields.some((f) => f.name === "id");
  if (!hasId) noId.push(m.name);
  const pkField = m.fields.find((f) => f.isId);
  if (m.primaryKey) compoundPk.push(m.name + " -> " + JSON.stringify(m.primaryKey.fields));
  if (pkField && pkField.name !== "id") idNotPk.push(`${m.name} (pk=${pkField.name}, hasIdColumn=${hasId})`);
  if (!pkField && !m.primaryKey) console.log("NO PK AT ALL:", m.name);
}
console.log("scoped models with NO id field:", noId);
console.log("scoped models whose PK is not 'id':", idNotPk);
console.log("scoped models with COMPOUND pk:", compoundPk);
// unique constraints on PracticeSetting
const ps = byKey.get("practiceSetting")!;
console.log("PracticeSetting fields:", ps.fields.map(f=>`${f.name}:${f.type}${f.isId?" @id":""}${f.isUnique?" @unique":""}`));
console.log("PracticeSetting uniqueIndexes:", JSON.stringify(ps.uniqueIndexes));
console.log("PracticeSetting primaryKey:", JSON.stringify(ps.primaryKey));
// also: which scoped models have a UNIQUE constraint NOT including tenantId (global uniqueness) - broader finding
for (const s of SCOPED_MODELS) {
  const m = byKey.get(s)!;
  const uni = m.uniqueIndexes.filter(u => !u.fields.includes("tenantId"));
  const uniField = m.fields.filter(f => f.isUnique).map(f=>f.name);
  if (uni.length || uniField.length) console.log("  global-unique:", m.name, JSON.stringify(uni.map(u=>u.fields)), uniField);
}
