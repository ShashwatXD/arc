import "server-only";

import { CohereRerank } from "@langchain/cohere";
import { ConfigError } from "@/domain/errors";
import type { Chunk } from "@/domain/models";
import type { RerankerPort } from "@/domain/ports";
import { env } from "@/lib/env";

export function hasCohereKey(): boolean {
  return Boolean(env().COHERE_API_KEY);
}

export function createCohereReranker(): RerankerPort {
  const apiKey = env().COHERE_API_KEY;
  return {
    available: Boolean(apiKey),
    async rerank(query: string, chunks: Chunk[], topN: number) {
      if (!apiKey) {
        throw new ConfigError("COHERE_API_KEY is missing. Rerank cannot run.");
      }
      if (chunks.length === 0) return [];
      const compressor = new CohereRerank({
        apiKey,
        model: "rerank-v3.5",
        topN: Math.min(topN, chunks.length),
      });
      const ranked = await compressor.rerank(
        chunks.map((c) => c.text),
        query,
        { topN: Math.min(topN, chunks.length) },
      );
      return ranked
        .map((row) => chunks[row.index])
        .filter((c): c is Chunk => Boolean(c));
    },
  };
}
