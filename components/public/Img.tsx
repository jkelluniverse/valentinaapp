"use client";

import { useState } from "react";

// C18 — a graceful asset slot. Renders the image if the file is present; if it
// 404s it quietly shows the fallback instead of a broken-image icon, so the page
// never looks broken. Mirrors the onerror fallbacks in the design mock.
export function Img({
  src,
  alt,
  className,
  fallback = null,
  loading,
  width,
  height,
}: {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  loading?: "lazy" | "eager";
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      width={width}
      height={height}
      onError={() => setFailed(true)}
    />
  );
}
