"use client";

import { useEffect, useState } from "react";

// The per-device push switch (client settings → Notifications). Honest states:
// unsupported (this browser can't), blocked (they said no at the browser
// level), off, on, busy. iOS note: Safari only allows web push once the app is
// added to the Home Screen (iOS 16.4+), so we say so instead of failing mutely.

type State = "loading" | "unsupported" | "blocked" | "off" | "on" | "busy";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushToggle({
  vapidPublicKey,
  labels,
}: {
  vapidPublicKey: string;
  labels: { enable: string; disable: string; on: string; unsupported: string; blocked: string; iosHint: string };
}) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "loading") return <span className="text-sm text-slate">…</span>;
  if (state === "unsupported") {
    return <span className="max-w-xs text-right text-xs text-slate">{labels.unsupported} {labels.iosHint}</span>;
  }
  if (state === "blocked") {
    return <span className="max-w-xs text-right text-xs text-slate">{labels.blocked}</span>;
  }

  return (
    <span className="flex items-center gap-3">
      {state === "on" && <span className="text-sm font-medium text-wine">{labels.on}</span>}
      <button
        type="button"
        disabled={state === "busy"}
        onClick={state === "on" ? disable : enable}
        aria-busy={state === "busy"}
        className="inline-flex items-center gap-2 rounded-md border border-mocha px-3 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush disabled:cursor-wait disabled:opacity-70"
      >
        {state === "busy" && (
          <span
            aria-hidden
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {state === "on" ? labels.disable : labels.enable}
      </button>
    </span>
  );
}
