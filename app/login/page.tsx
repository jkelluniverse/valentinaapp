import { Suspense } from "react";
import { tenantAuthMetadata } from "@/lib/auth-metadata";

// C29 — tab chrome (title/app-name) resolves from the request's tenant.
export const generateMetadata = tenantAuthMetadata;
import { AuthWordmark } from "@/components/AuthWordmark";
import { LoginForm } from "./LoginClient";

// C29-EVENT-CHROME — the wordmark resolves from the request's tenant (server
// side, law #5), so a founding practitioner's own sign-in screen carries THEIR
// name while the default tenant's output stays byte-identical ("veritas" is
// her stored portalTitle). The form itself is unchanged, in ./LoginClient.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm brand={<AuthWordmark />} />
    </Suspense>
  );
}
