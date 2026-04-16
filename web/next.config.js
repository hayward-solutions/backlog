/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // CSP: tightened for an SPA that only talks to its own origin and a
  // configured API base. frame-ancestors mirrors X-Frame-Options for
  // clickjacking defence on browsers that honour CSP. Next.js requires
  // 'unsafe-inline' for its runtime styles.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' " + (process.env.NEXT_PUBLIC_API_BASE_URL || ""),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Legacy /desk/* URLs (tracking links sent to submitters before the
  // rename) redirect to the new /service-desk/* structure so existing
  // bookmarks keep working.
  async redirects() {
    return [
      {
        source: "/desk",
        destination: "/service-desk",
        permanent: true,
      },
      {
        source: "/desk/:path*",
        destination: "/service-desk/:path*",
        permanent: true,
      },
    ];
  },
};
module.exports = nextConfig;
