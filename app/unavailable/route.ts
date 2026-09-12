// C26-FAIL-CLOSED-TENANCY §3 — what a visitor sees when this request's host
// cannot be resolved to a practice (the tenant lookup errored with nothing
// cached). HTTP 503 with Retry-After: since ruling 33 stopped the cache from
// poisoning, the next request usually succeeds, so this is a brief
// interruption and says so honestly. NEUTRAL BY LAW: no practice name, no
// practice branding, no logo belonging to anyone — rendering one practice's
// identity on another's domain is the defect this page exists to not repeat.
// Both languages on one page (law #7): locale negotiation would need
// per-practice config, which is exactly what we cannot read right now.
export const dynamic = "force-dynamic";

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Temporarily unavailable · Temporalmente no disponible</title>
<style>
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;
       background:#FAF7F2;color:#2A2733;font-family:-apple-system,'Segoe UI',Arial,sans-serif;}
  main{max-width:34rem;padding:3rem 1.5rem;text-align:center;}
  h1{font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:1.6rem;margin:0 0 1rem;}
  p{font-size:1rem;line-height:1.65;color:#5A5B66;margin:0 0 1.25rem;}
  hr{border:none;border-top:1px solid rgba(42,39,51,.12);margin:2rem auto;width:3rem;}
</style>
</head>
<body>
<main>
  <h1>This page is temporarily unavailable</h1>
  <p>Something went wrong on our side — not yours, and not this practice's.
     Please try again in a moment; it usually resolves right away.</p>
  <hr>
  <h1 lang="es">Esta página no está disponible temporalmente</h1>
  <p lang="es">Algo falló de nuestro lado — no del tuyo, ni de esta consulta.
     Por favor, inténtalo de nuevo en un momento; normalmente se resuelve enseguida.</p>
</main>
</body>
</html>`;

export async function GET(): Promise<Response> {
  return new Response(PAGE, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "10",
      "Cache-Control": "no-store",
    },
  });
}
