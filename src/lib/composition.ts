import "server-only";

import { createLangchainChunker } from "@/adapters/chunker";
import { createOpenAiEmbedder, createOpenAiLlm } from "@/adapters/openai";
import { createQdrantRetrieval } from "@/adapters/qdrant";
import { createLlmReranker } from "@/adapters/rerank";
import { createLangGraphRunner } from "@/adapters/langgraph-runner";
import type {
  ChunkerPort,
  EmbedderPort,
  LlmPort,
  RetrievalPort,
  RerankerPort,
  WorkflowRunnerPort,
} from "@/domain/ports";
import { env } from "@/lib/env";

export type Services = {
  llm: LlmPort;
  embedder: EmbedderPort;
  chunker: ChunkerPort;
  retrieval: RetrievalPort;
  reranker: RerankerPort;
  runner: WorkflowRunnerPort;
};

let services: Services | null = null;

export function resetServices() {
  services = null;
}

export function getServices(): Services {
  if (!services) {
    const llm = createOpenAiLlm();
    const embedder = createOpenAiEmbedder(env().EMBEDDING_MODEL);
    const chunker = createLangchainChunker();
    const retrieval = createQdrantRetrieval();
    const reranker = createLlmReranker(llm);
    services = {
      llm,
      embedder,
      chunker,
      retrieval,
      reranker,
      runner: createLangGraphRunner({ llm, embedder, retrieval, reranker }),
    };
  }
  return services;
}
