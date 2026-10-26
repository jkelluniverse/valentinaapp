"use client";

// React 18.3 in this project: the form-state hook is useFormState from
// react-dom, NOT React 19's useActionState. An earlier draft imported the
// latter, which the build reports only as a WARNING while the page would have
// crashed in the browser — a green build is not a working page.
import { useFormState, useFormStatus } from "react-dom";
import { connectCalendlyAction, connectAcuityAction, type ConnectState } from "./actions";

// C37 §6 — client components for one reason only: the Acuity ingress URL is a
// SECRET SHOWN ONCE, and returning it through the action's in-memory state keeps
// it out of the address bar, the browser's history and the server's request logs.
// A ?query= round-trip would have leaked it into all three.

const input = "w-full rounded-lg border border-line px-3 py-2 text-sm";
const label = "block text-sm font-medium text-ink-strong";
const btn = "rounded-lg bg-ink-strong px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

/** useFormStatus reports on the nearest form ABOVE it, so the submit button has
 *  to be its own component rendered inside the form — reading the hook in the
 *  form component itself would always report idle. */
function Submit({ idle }: { idle: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={btn} disabled={pending}>
      {pending ? "Connecting…" : idle}
    </button>
  );
}

export function CalendlyForm({ connected }: { connected: boolean }) {
  const [state, action] = useFormState<ConnectState, FormData>(connectCalendlyAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label className={label} htmlFor="owner">Your Calendly user link</label>
        <p className="mb-1 text-xs text-slate">
          In Calendly, this is the API URI for your account. It starts with https://api.calendly.com/users/
        </p>
        <input id="owner" name="owner" className={input} placeholder="https://api.calendly.com/users/…" />
      </div>
      <div>
        <label className={label} htmlFor="signingKey">Webhook signing key</label>
        <p className="mb-1 text-xs text-slate">
          Calendly shows this once when you create the webhook subscription. It is stored encrypted.
        </p>
        <input id="signingKey" name="signingKey" type="password" className={input} />
      </div>
      {state.error && <p className="text-sm text-wine">{state.error}</p>}
      <Submit idle={connected ? "Update connection" : "Connect Calendly"} />
    </form>
  );
}

export function AcuityForm({ connected }: { connected: boolean }) {
  const [state, action] = useFormState<ConnectState, FormData>(connectAcuityAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div>
        <label className={label} htmlFor="apiKey">Your Acuity API key</label>
        <p className="mb-1 text-xs text-slate">
          Acuity → Integrations → API. Stored encrypted; used to check that incoming bookings are genuinely from Acuity.
        </p>
        <input id="apiKey" name="apiKey" type="password" className={input} />
      </div>
      {state.error && <p className="text-sm text-wine">{state.error}</p>}
      <Submit idle={connected ? "Reconnect and issue a new URL" : "Connect Acuity"} />

      {state.ingressUrl && (
        <div className="rounded-lg border border-line bg-canvas-subtle p-4">
          <p className="text-sm font-medium text-ink-strong">Paste this into Acuity as your webhook URL</p>
          <p className="mt-1 text-xs text-slate">
            This is yours alone and is shown once — we keep only a fingerprint of it, so it cannot be
            looked up later. If you lose it, reconnect and we will issue a new one.
          </p>
          <code className="mt-2 block break-all rounded bg-white p-2 text-xs">{state.ingressUrl}</code>
        </div>
      )}
    </form>
  );
}
