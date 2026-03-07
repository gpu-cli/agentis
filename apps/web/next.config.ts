import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: [
    "@multiverse/shared",
    "@multiverse/ingest",
    "@multiverse/ui",
    "@multiverse/world-model",
    "@multiverse/engine",
  ],
};

export default nextConfig;
