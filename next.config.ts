import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Avoid Vercel build failures from eslint flat-config quirks
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
