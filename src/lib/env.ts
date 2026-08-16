import "server-only";

import { z } from "zod";
import { ConfigError } from "@/domain/errors";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  QDRANT_URL: z.string().default("http://127.0.0.1:6333"),
  QDRANT_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    cached = envSchema.parse({
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      COHERE_API_KEY: process.env.COHERE_API_KEY,
      QDRANT_URL: process.env.QDRANT_URL,
      QDRANT_API_KEY: process.env.QDRANT_API_KEY,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
    });
  }
  return cached;
}

export function requireOpenAiKey(): string {
  const key = env().OPENAI_API_KEY;
  if (!key) {
    throw new ConfigError("OPENAI_API_KEY is missing. Add it to .env.local.");
  }
  return key;
}
