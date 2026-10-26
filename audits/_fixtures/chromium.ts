import { existsSync, readdirSync } from "fs";

// THE BROWSER BINARY, RESOLVED — not pinned. The environment image was rebuilt
// on 2026-10-22 and the pinned path every browser gate carried
// (chromium_headless_shell-1194/…) vanished: eleven gates would have failed on
// a missing file, not a defect. The resolver prefers an explicit override,
// then the newest headless shell under PLAYWRIGHT_BROWSERS_PATH, then the
// environment's stable `chromium` symlink, and fails loudly with the list it
// tried. A gate that cannot find a browser must say so in one line, not time
// out 46 times.
const ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";

function newestHeadlessShell(): string | null {
  try {
    const dirs = readdirSync(ROOT)
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const d of dirs) {
      for (const bin of ["chrome-linux/headless_shell", "chrome-linux/chrome-headless-shell", "chrome-headless-shell-linux64/chrome-headless-shell"]) {
        const p = `${ROOT}/${d}/${bin}`;
        if (existsSync(p)) return p;
      }
    }
  } catch { /* no browsers dir */ }
  return null;
}

export function resolveChromium(): string {
  const tried: string[] = [];
  const candidates = [
    process.env.PW_CHROMIUM_EXE,
    newestHeadlessShell(),
    `${ROOT}/chromium`,
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    tried.push(c);
    if (existsSync(c)) return c;
  }
  throw new Error(`no Chromium binary found — tried: ${tried.join(", ")} (set PW_CHROMIUM_EXE)`);
}

export const CHROMIUM_EXE = resolveChromium();
