import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp', '@prisma/client', 'prisma'],
};

export default nextConfig;
