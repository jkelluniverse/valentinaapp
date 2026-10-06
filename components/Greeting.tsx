"use client";

import { useEffect, useState } from "react";

// Time-aware greeting from the viewer's own clock. Renders a neutral greeting
// on the server/first paint, then settles to the right time-of-day — no layout
// shift beyond the word itself.
export function Greeting({ name }: { name: string }) {
  const [part, setPart] = useState<string | null>(null);

  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <h1 className="font-headline text-[2.125rem] font-medium leading-tight text-ink-strong">
      {part ?? "Hello"}, {name}.
    </h1>
  );
}
