import type { NextConfig } from "next";
import path from "path";

const isStaticExport = process.env.AGENTIS_STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : "standalone",
  ...(isStaticExport ? {} : { outputFileTracingRoot: path.join(__dirname, "../../") }),
  transpilePackages: [
    "@multiverse/shared",
    "@multiverse/ingest",
    "@multiverse/ui",
    "@multiverse/world-model",
    "@multiverse/engine",
  ],
};

export default nextConfig;
