import type { MetadataRoute } from "next";

// AMENDMENT-02 §4 — the web app manifest. Warm Stone theme, the ✧ mark, opens
// standalone so it lives on the home screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veritas",
    short_name: "Veritas",
    description: "A private space for reflection and progress between sessions.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FEF4EA",
    theme_color: "#FEF4EA",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
