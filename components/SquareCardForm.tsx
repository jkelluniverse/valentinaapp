"use client";

import { useEffect, useRef, useState } from "react";

// Square Web Payments SDK card form. The card number lives entirely inside
// Square's secure iframe — this component only ever sees a single-use token,
// which it posts to the server action. That's the whole PCI point.

type SquarePayments = {
  card: () => Promise<{
    attach: (selector: string) => Promise<void>;
    tokenize: () => Promise<{ status: string; token?: string }>;
  }>;
};

declare global {
  interface Window {
    Square?: { payments: (appId: string, locationId: string) => SquarePayments };
  }
}

export function SquareCardForm({
  applicationId,
  locationId,
  scriptUrl,
  amountLabel,
  payAction,
  successPath = "/space/schedule?paid=1",
  buttonLabel,
  successMessage = "Paid — thank you.",
  sandbox = false,
}: {
  applicationId: string;
  locationId: string;
  scriptUrl: string;
  amountLabel: string;
  payAction: (token: string) => Promise<{ ok: boolean; error?: string }>;
  successPath?: string; // where to land after a successful payment
  buttonLabel?: string; // overrides "Pay {amountLabel}" (e.g. "Save card on file")
  successMessage?: string;
  sandbox?: boolean; // test mode — real cards are rejected by design
}) {
  const cardRef = useRef<Awaited<ReturnType<SquarePayments["card"]>> | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "paying" | "failed">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!window.Square) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = scriptUrl;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("script"));
          document.head.appendChild(s);
        });
      }
      if (cancelled || !window.Square) return;
      const payments = window.Square.payments(applicationId, locationId);
      const card = await payments.card();
      if (cancelled) return;
      await card.attach("#square-card");
      cardRef.current = card;
      setState("ready");
    }

    init().catch(() => {
      if (!cancelled) {
        setState("failed");
        setMessage("The secure card form couldn't load — please try again in a moment.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applicationId, locationId, scriptUrl]);

  async function pay() {
    const card = cardRef.current;
    if (!card || state !== "ready") return;
    setState("paying");
    setMessage(null);
    try {
      const result = await card.tokenize();
      if (result.status !== "OK" || !result.token) {
        setState("ready");
        setMessage("The card details didn't go through — check them and try again.");
        return;
      }
      const res = await payAction(result.token);
      if (!res.ok) {
        setState("ready");
        setMessage(
          res.error === "declined"
            ? "The card was declined — another card, or reach out and we'll sort it together."
            : "The payment couldn't be completed just now — nothing was charged twice; try again.",
        );
        return;
      }
      setMessage(successMessage);
      window.location.assign(successPath);
    } catch {
      setState("ready");
      setMessage("Something interrupted the payment — please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div id="square-card" className="min-h-[92px]" />
      {message && <p className="text-sm text-wine">{message}</p>}
      <button
        type="button"
        onClick={pay}
        disabled={state !== "ready"}
        className="self-start rounded-md bg-wine px-6 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90 disabled:opacity-50"
      >
        {state === "paying"
          ? "Working…"
          : state === "loading"
            ? "Preparing…"
            : buttonLabel ?? `Pay ${amountLabel}`}
      </button>
      {sandbox && (
        <p className="rounded-md border border-mocha bg-blush/40 px-3 py-2 text-xs text-wine">
          Test mode — real cards are rejected here on purpose. Use card{" "}
          <span className="font-semibold">4111 1111 1111 1111</span>, any future date, CVV 111,
          ZIP 94103.
        </p>
      )}
      <p className="text-xs text-slate">
        Card details go straight to Square&apos;s secure form — they never touch this app.
      </p>
    </div>
  );
}
