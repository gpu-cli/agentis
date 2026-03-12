import type { NextConfig } from "next";

/**
 * Static export configuration for agentis local builds.
 * 
 * Produces a fully static site in `out/` that can be served by any HTTP server.
 * No Node.js server runtime needed — all PixiJS rendering and transcript
 * processing happens client-side via Web Workers.
 */
const nextConfig: NextConfig = {
  output: "export",
  transpilePackages: [
    "@multiverse/shared",
    "@multiverse/ingest",
    "@multiverse/ui",
    "@multiverse/world-model",
    "@multiverse/engine",
  ],
};

export default nextConfig;
