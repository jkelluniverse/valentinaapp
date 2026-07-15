import createNextIntlPlugin from "next-intl/plugin";

// AMD-05 — next-intl WITHOUT i18n routing: the portal locale is the signed-in
// user's preference (no URL churn); the request config reads it per request.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Reference uploads (PDFs/images) for the AI studios.
      bodySizeLimit: "10mb",
    },
  },
};
export default withNextIntl(nextConfig);
