import "server-only";

import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { EmbedderPort, LlmPort, LlmRequest } from "@/domain/ports";
import { embeddingApiKey, env, requireOpenAiKey } from "@/lib/env";

export function hasOpenAiKey(): boolean {
  return Boolean(env().OPENAI_API_KEY);
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: string }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}

function clientOptions(baseURL: string | undefined) {
  return baseURL ? { baseURL } : undefined;
}

function chatModel(input: Pick<LlmRequest, "model" | "temperature">) {
  const { OPENAI_BASE_URL } = env();
  return new ChatOpenAI({
    model: input.model,
    temperature: input.temperature ?? 0.1,
    apiKey: requireOpenAiKey(),
    timeout: 60_000,
    maxRetries: 4,
    configuration: clientOptions(OPENAI_BASE_URL),
  });
}

export function createOpenAiLlm(): LlmPort {
  return {
    async complete(input: LlmRequest) {
      const model = chatModel(input);
      const runnable = input.json
        ? model.withConfig({ response_format: { type: "json_object" } })
        : model;
      const response = await runnable.invoke(input.messages);
      return contentToText(response.content);
    },
    async *stream(input: LlmRequest) {
      const stream = await chatModel(input).stream(input.messages);
      for await (const chunk of stream) {
        const token = contentToText(chunk.content);
        if (token) yield token;
      }
    },
  };
}

export function createOpenAiEmbedder(model = env().EMBEDDING_MODEL): EmbedderPort {
  return {
    model,
    async embed(texts: string[]) {
      if (texts.length === 0) return [];
      const embeddings = new OpenAIEmbeddings({
        model,
        apiKey: embeddingApiKey(),
        timeout: 60_000,
        maxRetries: 4,
        configuration: clientOptions(env().EMBEDDING_BASE_URL ?? env().OPENAI_BASE_URL),
      });
      return embeddings.embedDocuments(texts);
    },
  };
}
