import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valentina's Coaching Platform",
  description: "A private space for reflection and progress between sessions.",
};

// EXPERIMENT: minimal layout, no next/font/google, to isolate whether the
// font loader is behind the render-time redirect on Railway.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cream font-body text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
