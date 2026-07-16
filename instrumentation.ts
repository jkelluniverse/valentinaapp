// Server-process observability. A stray unhandled rejection (a floating
// promise anywhere in a request) crashes Node by default — every in-flight
// request then surfaces as a bare 502 at the edge with no trace. Log the full
// stack and keep serving instead; the deploy logs then say exactly what broke.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.on("unhandledRejection", (reason) => {
    console.error(
      "[unhandledRejection]",
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
    );
  });
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err.stack ?? err.message);
  });
}
