import type { NextConfig } from "next";

/**
 * Two editions from one codebase:
 *  - STATIC_EXPORT=1 (Docker): static site served by Caddy; /api goes to the Python FastAPI service.
 *  - default (Vercel): full Next.js app; the API lives in `route.vercel.ts` handlers (Neon Postgres).
 * The `.vercel.ts` page extension is only enabled for the Vercel edition, so the static export ignores those routes.
 */
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStatic ? { output: "export" as const } : {}),
  pageExtensions: isStatic ? ["tsx", "ts"] : ["vercel.ts", "tsx", "ts"],
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
