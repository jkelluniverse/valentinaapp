"use client";

// Last-resort boundary (errors in the root layout itself). Must render its own
// <html>/<body> per Next.js contract.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Something went wrong on our side</h1>
        <p style={{ opacity: 0.7, maxWidth: 480, margin: "0 auto 1rem" }}>
          This page didn&rsquo;t load. Please try again in a moment.
        </p>
        {error?.digest && <p style={{ opacity: 0.4, fontSize: 12 }}>Reference: {error.digest}</p>}
        <button
          onClick={() => reset()}
          style={{ marginTop: 12, padding: "8px 16px", border: "1px solid #999", borderRadius: 8, background: "none", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
