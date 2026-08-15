import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ed4u/domain", "@ed4u/facility-engine", "@ed4u/mentor-engine"],
  // Tests and local browsing use 127.0.0.1 rather than localhost; without this
  // the dev server blocks HMR requests and floods the console with warnings.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
