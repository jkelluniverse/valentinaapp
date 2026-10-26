"use client";

import { useEffect } from "react";

// AMENDMENT-02 §4 — register the shell service worker for instant opens. Fails
// silently where unsupported; no offline-write complexity.
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
