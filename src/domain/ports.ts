import type { Citation, Chunk, TraceStep } from "./models";

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmRequest = {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  json?: boolean;
};

export type LlmPort = {
  complete(input: LlmRequest): Promise<string>;
  stream(input: LlmRequest): AsyncIterable<string>;
};

export type EmbedderPort = {
  model: string;
  embed(texts: string[]): Promise<number[][]>;
};

export type ChunkerPort = {
  split(text: string, size: number, overlap: number): Promise<string[]>;
};

export type RetrievedChunk = Chunk & {
  sourceName: string;
  score: number;
};

export type RetrievalSearchInput = {
  workspaceId: string;
  query: string;
  queryVector: number[];
  denseTopK: number;
  sparseTopK: number;
  fusedTopK: number;
};

export type RetrievalPort = {
  ping(): Promise<boolean>;
  upsert(chunks: RetrievedChunk[]): Promise<void>;
  removeSource(sourceId: string): Promise<void>;
  removeWorkspace(workspaceId: string): Promise<void>;
  search(input: RetrievalSearchInput): Promise<RetrievedChunk[]>;
};

export type RerankerPort = {
  available: boolean;
  rerank(query: string, chunks: Chunk[], topN: number): Promise<Chunk[]>;
};

export type RetrieveInput = {
  workspaceId: string;
  question: string;
  history: LlmMessage[];
  workflowId?: string;
};

export type RetrieveResult = {
  question: string;
  rewritten: string | null;
  chunks: RetrievedChunk[];
  citations: Citation[];
  traceSteps: TraceStep[];
  generateConfig: {
    model: string;
    temperature: number;
    systemPrompt: string;
  };
  prompt: LlmMessage[];
};

export type WorkflowRunnerPort = {
  retrieve(input: RetrieveInput): Promise<RetrieveResult>;
};
