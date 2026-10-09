import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/dispatch": ["./backend/static/**/*"],
    "/static/*": ["./backend/static/**/*"],
  },
};

export default nextConfig;
