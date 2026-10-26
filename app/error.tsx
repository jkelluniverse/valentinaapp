"use client";

// Segment error boundary — a render error becomes a calm page instead of an
// aborted response (which the edge reports as a bare 502). The digest pairs
// this screen with the server-side stack in the logs.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong on our side</h1>
      <p className="max-w-md text-[15px] opacity-70">
        This moment didn&rsquo;t load. Nothing you did — please try again, and if it
        keeps happening, let Valentina know.
      </p>
      {error?.digest && (
        <p className="text-xs opacity-40">Reference: {error.digest}</p>
      )}
      <button
        onClick={() => reset()}
        className="mt-2 rounded-lg border px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
