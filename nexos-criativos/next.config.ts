import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', '@prisma/client', 'prisma'],
  output: 'standalone',
};

export default nextConfig;
