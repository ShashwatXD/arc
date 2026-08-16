import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@libsql/client",
    "unpdf",
    "@langchain/core",
    "@langchain/langgraph",
    "@langchain/openai",
    "@langchain/textsplitters",
    "@qdrant/js-client-rest",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
