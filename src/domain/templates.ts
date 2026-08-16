import type { NodeKind, WorkflowGraph } from "./workflow";

const GROUNDED_PROMPT =
  "You are Arc, a grounded assistant. Answer only from the provided sources. Cite claims as [n] matching the source list. If the sources are insufficient, say you do not know and what is missing. Never invent sources or citations.";

const x = [80, 280, 480, 680, 880, 1080, 1280];
const y = 160;

function node(
  kind: NodeKind,
  index: number,
  config: Record<string, unknown> = {},
): WorkflowGraph["nodes"][number] {
  return {
    id: `n-${kind}`,
    kind,
    position: { x: x[index] ?? index * 200, y },
    config,
  };
}

function edge(from: NodeKind, to: NodeKind): WorkflowGraph["edges"][number] {
  return { id: `e-${from}-${to}`, source: `n-${from}`, target: `n-${to}` };
}

export const workflowTemplates = {
  balanced: {
    name: "Balanced",
    description: "Rewrite, hybrid retrieve, rerank, then generate. Best default.",
    graph: {
      nodes: [
        node("sources", 0),
        node("chunk", 1, { size: 800, overlap: 120 }),
        node("embed", 2, { model: "text-embedding-3-small" }),
        node("rewrite", 3, { enabled: true }),
        node("retrieve", 4, { denseTopK: 12, sparseTopK: 12, fusedTopK: 12 }),
        node("rerank", 5, { enabled: true, topN: 6 }),
        node("generate", 6, { model: "gpt-4o-mini", temperature: 0.1, systemPrompt: GROUNDED_PROMPT }),
      ],
      edges: [
        edge("sources", "chunk"),
        edge("chunk", "embed"),
        edge("embed", "rewrite"),
        edge("rewrite", "retrieve"),
        edge("retrieve", "rerank"),
        edge("rerank", "generate"),
      ],
    } satisfies WorkflowGraph,
  },
  precise: {
    name: "High precision",
    description: "Deeper retrieve and a tight rerank cutoff. Slower, fewer hallucinations.",
    graph: {
      nodes: [
        node("sources", 0),
        node("chunk", 1, { size: 600, overlap: 100 }),
        node("embed", 2, { model: "text-embedding-3-small" }),
        node("rewrite", 3, { enabled: true }),
        node("retrieve", 4, { denseTopK: 20, sparseTopK: 20, fusedTopK: 16 }),
        node("rerank", 5, { enabled: true, topN: 4 }),
        node("generate", 6, { model: "gpt-4o-mini", temperature: 0, systemPrompt: GROUNDED_PROMPT }),
      ],
      edges: [
        edge("sources", "chunk"),
        edge("chunk", "embed"),
        edge("embed", "rewrite"),
        edge("rewrite", "retrieve"),
        edge("retrieve", "rerank"),
        edge("rerank", "generate"),
      ],
    } satisfies WorkflowGraph,
  },
  fast: {
    name: "Fast",
    description: "No rewrite or rerank. Use while iterating on sources.",
    graph: {
      nodes: [
        node("sources", 0),
        node("chunk", 1, { size: 1000, overlap: 80 }),
        node("embed", 2, { model: "text-embedding-3-small" }),
        node("retrieve", 3, { denseTopK: 6, sparseTopK: 6, fusedTopK: 6 }),
        node("generate", 4, { model: "gpt-4o-mini", temperature: 0.2, systemPrompt: GROUNDED_PROMPT }),
      ],
      edges: [
        edge("sources", "chunk"),
        edge("chunk", "embed"),
        edge("embed", "retrieve"),
        edge("retrieve", "generate"),
      ],
    } satisfies WorkflowGraph,
  },
} as const;

export type TemplateId = keyof typeof workflowTemplates;
