import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Work order photos go up through a server action. Phones shrink them first, but an
    // un-shrinkable original (HEIC) can be up to 15 MB, ten at a time (src/lib/files.ts).
    serverActions: { bodySizeLimit: "160mb" },
  },
};

export default nextConfig;
