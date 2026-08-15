import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ed4u/domain", "@ed4u/facility-engine", "@ed4u/mentor-engine"],
};

export default nextConfig;
