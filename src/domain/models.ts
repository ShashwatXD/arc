export type Workspace = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  activeWorkflowId: string | null;
  isSample: boolean;
};

export type SourceKind = "pdf" | "docx" | "md" | "txt" | "url" | "note";
export type SourceStatus = "pending" | "indexing" | "ready" | "error";

export type Source = {
  id: string;
  workspaceId: string;
  kind: SourceKind;
  name: string;
  status: SourceStatus;
  byteSize: number;
  rawText: string;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type Chunk = {
  id: string;
  sourceId: string;
  workspaceId: string;
  ordinal: number;
  text: string;
  embedding: number[] | null;
};

export type Conversation = {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type Citation = {
  chunkId: string;
  sourceId: string;
  sourceName: string;
  ordinal: number;
  text: string;
  score: number;
};

export type Message = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  traceId: string | null;
  createdAt: number;
};

export type EvalDataset = {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
};

export type EvalItem = {
  id: string;
  datasetId: string;
  question: string;
  expectedAnswer: string;
};

export type EvalMetrics = {
  faithfulness: number;
  relevancy: number;
  citationPrecision: number;
};

export type EvalRun = {
  id: string;
  datasetId: string;
  workspaceId: string;
  workflowId: string;
  workflowName: string;
  startedAt: number;
  finishedAt: number | null;
  metrics: EvalMetrics | null;
  error: string | null;
};

export type EvalResult = {
  id: string;
  runId: string;
  itemId: string;
  question: string;
  expectedAnswer: string;
  answer: string;
  scores: EvalMetrics;
  passed: boolean;
  citations: Citation[];
  traceId: string;
  reason: string;
};

export type TraceKind = "chat" | "eval";

export type TraceStep = {
  name: "rewrite" | "retrieve" | "rerank" | "generate";
  startedAt: number;
  durationMs: number;
  detail: string;
  data?: Record<string, unknown>;
};

export type Trace = {
  id: string;
  workspaceId: string;
  kind: TraceKind;
  question: string;
  rewritten: string | null;
  steps: TraceStep[];
  citationCount: number;
  createdAt: number;
};
