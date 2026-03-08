import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "104.237.9.71"],
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
