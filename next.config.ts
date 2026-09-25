import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["stripe", "@vercel/blob"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picturescdn.estatesales.net", pathname: "/**" },
      { protocol: "https", hostname: "cdn.estatesales.net", pathname: "/**" },
      { protocol: "https", hostname: "www.estatesales.net", pathname: "/**" },
      { protocol: "https", hostname: "estatesales.net", pathname: "/**" },
      { protocol: "https", hostname: "www.estatesales.org", pathname: "/**" },
      { protocol: "https", hostname: "estatesales.org", pathname: "/**" },
      { protocol: "https", hostname: "images.estatesales.org", pathname: "/**" },
      { protocol: "https", hostname: "dfm0jp10ki2dt.cloudfront.net", pathname: "/**" },
      { protocol: "https", hostname: "*.cloudfront.net", pathname: "/**" },
    ],
  },
};

export default nextConfig;
