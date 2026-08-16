import "server-only";

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ConfigError } from "@/domain/errors";

const storedSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().optional(),
  EMBEDDING_MODEL: z.string().optional(),
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
});

export type StoredSettings = z.infer<typeof storedSchema>;

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_BASE_URL: z.string().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  QDRANT_URL: z.string().default("http://127.0.0.1:6333"),
  QDRANT_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const settingsPath = () => path.join(process.cwd(), "data", "settings.json");

function pick(stored: string | undefined, fallback: string | undefined) {
  const a = stored?.trim();
  if (a) return a;
  const b = fallback?.trim();
  return b || undefined;
}

export function readStoredSettings(): StoredSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf8");
    return storedSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeStoredSettings(next: StoredSettings) {
  const dir = path.dirname(settingsPath());
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${settingsPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, settingsPath());
  resetEnv();
}

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const stored = readStoredSettings();
    cached = envSchema.parse({
      OPENAI_API_KEY: pick(stored.OPENAI_API_KEY, process.env.OPENAI_API_KEY),
      OPENAI_BASE_URL: pick(stored.OPENAI_BASE_URL, process.env.OPENAI_BASE_URL),
      OPENAI_MODEL: pick(stored.OPENAI_MODEL, process.env.OPENAI_MODEL) ?? "gpt-4o-mini",
      EMBEDDING_API_KEY: pick(stored.EMBEDDING_API_KEY, process.env.EMBEDDING_API_KEY),
      EMBEDDING_BASE_URL: pick(stored.EMBEDDING_BASE_URL, process.env.EMBEDDING_BASE_URL),
      EMBEDDING_MODEL: pick(stored.EMBEDDING_MODEL, process.env.EMBEDDING_MODEL) ?? "text-embedding-3-small",
      QDRANT_URL: pick(stored.QDRANT_URL, process.env.QDRANT_URL) ?? "http://127.0.0.1:6333",
      QDRANT_API_KEY: pick(stored.QDRANT_API_KEY, process.env.QDRANT_API_KEY),
    });
  }
  return cached;
}

export function resetEnv() {
  cached = null;
}

export function requireOpenAiKey(): string {
  const key = env().OPENAI_API_KEY;
  if (!key) {
    throw new ConfigError("No chat API key. Open Keys and add one, or set OPENAI_API_KEY in .env.local.");
  }
  return key;
}

export function embeddingApiKey(): string {
  return pick(env().EMBEDDING_API_KEY, env().OPENAI_API_KEY) ?? requireOpenAiKey();
}
