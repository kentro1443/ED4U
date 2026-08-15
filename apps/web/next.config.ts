import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    const productionCsp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers:
          process.env.NODE_ENV === "production"
            ? [...common, { key: "Content-Security-Policy", value: productionCsp }]
            : common,
      },
    ];
  },
  transpilePackages: ["@ed4u/domain", "@ed4u/facility-engine", "@ed4u/mentor-engine"],
  // Tests and local browsing use 127.0.0.1 rather than localhost; without this
  // the dev server blocks HMR requests and floods the console with warnings.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
