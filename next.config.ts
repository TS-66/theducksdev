import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: no `output: "standalone"` — it breaks Vercel deployments.
  // Allow isolated CI-style builds without clobbering the dev server's .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
