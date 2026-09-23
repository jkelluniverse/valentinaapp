import { execFileSync } from "child_process";
const en = require("../messages/en/practitionerSettings.json").practitionerSettings;
const norm = (s: string) => s.replace(/&amp;/g, "&").replace(/&apos;|&#x27;/g, "'").replace(/\s+/g, " ").trim();
const leaves: {path:string;value:string}[] = [];
const walk = (o: any, p = "") => { for (const [k,v] of Object.entries(o)) typeof v === "string" ? leaves.push({path: p?`${p}.${k}`:k, value: v as string}) : walk(v, p?`${p}.${k}`:k); };
walk(en);
for (const ref of ["HEAD", "939a663", "bc689a0"]) {
  const src = norm(execFileSync("git", ["show", `${ref}:app/practitioner/settings/page.tsx`], { encoding: "utf8" }));
  const missing = leaves.filter((l) => !src.includes(norm(l.value).replace("{hours}", "{config.cancelCutoffHours}")));
  console.log(`${ref}: ${leaves.length} strings · ${missing.length} missing${missing.length ? " -> " + missing.map(m=>m.path).join(", ") : ""}`);
}
