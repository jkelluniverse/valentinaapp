/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Reference uploads (PDFs/images) for the AI studios.
      bodySizeLimit: "10mb",
    },
  },
};
export default nextConfig;
