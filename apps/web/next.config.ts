import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

// Single `.env` at the repo root is shared by every workspace. Next only reads
// `.env` from the app directory, so load the root file here (does not
// override variables that are already set).
loadDotenv({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const nextConfig: NextConfig = {
  // Standalone output keeps the Docker image small (see apps/web/Dockerfile).
  output: "standalone",
  // @marketpulse/db is consumed as TypeScript source (no build step), so Next
  // must transpile it. Prisma's generated client and pg stay server-external.
  transpilePackages: ["@marketpulse/db"],
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
