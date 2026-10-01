import { redirect } from "next/navigation";

// Worksheets are managed in the Library alongside prompts — one organized
// home. The studio/builder/preview routes under this path stay live.
export default function WorksheetsIndexRedirect() {
  redirect("/practitioner/library");
}
