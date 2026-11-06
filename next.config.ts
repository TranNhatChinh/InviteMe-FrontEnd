import type { NextConfig } from "next";

const mediaOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? "https://localhost:7043");

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    // Local API media resolves to loopback/private IPs, which Next's optimizer rejects.
    // In development, let the browser load media directly from the local API.
    unoptimized: process.env.NODE_ENV !== "production",
    remotePatterns: [
      {
        protocol: mediaOrigin.protocol.slice(0, -1) as "http" | "https",
        hostname: mediaOrigin.hostname,
        port: mediaOrigin.port,
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
