import "server-only";

import { z } from "zod";
import { ArcError } from "@/domain/errors";
import type { Chunk } from "@/domain/models";
import type { LlmPort, RerankerPort } from "@/domain/ports";
import { env } from "@/lib/env";

const orderSchema = z.object({
  order: z.array(z.number().int().positive()),
});

export function createLlmReranker(llm: LlmPort): RerankerPort {
  return {
    available: true,
    async rerank(query, chunks, topN, model) {
      if (chunks.length === 0) return [];
      const keep = Math.min(topN, chunks.length);
      if (chunks.length === 1) return chunks;

      const listed = chunks
        .map((chunk, i) => `[${i + 1}] ${chunk.text.slice(0, 500)}`)
        .join("\n");
      const prompt = `Question:\n${query}\n\nPassages:\n${listed}\n\nReturn JSON {"order": number[]} of 1-based indexes, most relevant first. Include every index exactly once.`;

      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const raw = await llm.complete({
            model: model || env().OPENAI_MODEL,
            temperature: 0,
            json: true,
            messages: [
              {
                role: "system",
                content: "You rank passages for a question. Return only valid JSON.",
              },
              { role: "user", content: prompt },
            ],
          });
          const parsed = orderSchema.parse(JSON.parse(raw));
          const seen = new Set<number>();
          const ordered: Chunk[] = [];
          for (const index of parsed.order) {
            const chunk = chunks[index - 1];
            if (!chunk || seen.has(index)) continue;
            seen.add(index);
            ordered.push(chunk);
          }
          for (const chunk of chunks) {
            if (ordered.length >= keep) break;
            if (!ordered.includes(chunk)) ordered.push(chunk);
          }
          return ordered.slice(0, keep);
        } catch (error) {
          lastError = error;
        }
      }
      throw new ArcError(
        `Rerank failed: ${lastError instanceof Error ? lastError.message : "invalid ranking JSON"}`,
        "rerank_failed",
        502,
      );
    },
  };
}
