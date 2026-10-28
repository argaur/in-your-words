import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: pkg.version,
    COMMIT_SHA: process.env.COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
  },
};

export default nextConfig;
