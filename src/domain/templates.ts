import type { NodeKind, WorkflowGraph } from "./workflow";

const GROUNDED_PROMPT =
  "You are Arc, a grounded assistant. Answer only from the provided sources. Cite claims as [n] matching the source list. If the sources are insufficient, say you do not know and what is missing. Never invent sources or citations.";

function node(
  kind: NodeKind,
  id: string,
  x: number,
  y: number,
  config: Record<string, unknown> = {},
): WorkflowGraph["nodes"][number] {
  return { id, kind, position: { x, y }, config };
}

function edge(source: string, target: string): WorkflowGraph["edges"][number] {
  return { id: `e-${source}-${target}`, source, target };
}

export const workflowTemplates = {
  balanced: {
    name: "Balanced",
    description: "Rewrite, hybrid retrieve, rerank, generate.",
    graph: {
      nodes: [
        node("sources", "n-sources", 40, 40),
        node("chunk", "n-chunk", 220, 40, { size: 800, overlap: 120 }),
        node("embed", "n-embed", 400, 40, { model: "text-embedding-3-small" }),
        node("rewrite", "n-rewrite", 40, 220, { enabled: true }),
        node("retrieve", "n-retrieve", 280, 220, { denseTopK: 12, sparseTopK: 12, fusedTopK: 12 }),
        node("rerank", "n-rerank", 520, 220, { enabled: true, topN: 6 }),
        node("generate", "n-generate", 760, 220, { model: "gpt-4o-mini", temperature: 0.1, systemPrompt: GROUNDED_PROMPT }),
      ],
      edges: [
        edge("n-sources", "n-chunk"),
        edge("n-chunk", "n-embed"),
        edge("n-embed", "n-rewrite"),
        edge("n-rewrite", "n-retrieve"),
        edge("n-retrieve", "n-rerank"),
        edge("n-rerank", "n-generate"),
      ],
    } satisfies WorkflowGraph,
  },
  precise: {
    name: "High precision",
    description: "Deeper retrieve, tight rerank, grade dropped chunks.",
    graph: {
      nodes: [
        node("sources", "n-sources", 40, 40),
        node("chunk", "n-chunk", 220, 40, { size: 600, overlap: 100 }),
        node("embed", "n-embed", 400, 40, { model: "text-embedding-3-small" }),
        node("rewrite", "n-rewrite", 40, 220, { enabled: true }),
        node("retrieve", "n-retrieve", 260, 220, { denseTopK: 20, sparseTopK: 20, fusedTopK: 16 }),
        node("grade", "n-grade", 500, 220, { minScore: 0.5 }),
        node("rerank", "n-rerank", 720, 220, { enabled: true, topN: 4 }),
        node("generate", "n-generate", 940, 220, { model: "gpt-4o-mini", temperature: 0, systemPrompt: GROUNDED_PROMPT }),
      ],
      edges: [
        edge("n-sources", "n-chunk"),
        edge("n-chunk", "n-embed"),
        edge("n-embed", "n-rewrite"),
        edge("n-rewrite", "n-retrieve"),
        edge("n-retrieve", "n-grade"),
        edge("n-grade", "n-rerank"),
        edge("n-rerank", "n-generate"),
      ],
    } satisfies WorkflowGraph,
  },
  fast: {
    name: "Fast",
    description: "Retrieve then generate. No rewrite or rerank.",
    graph: {
      nodes: [
        node("sources", "n-sources", 40, 40),
        node("chunk", "n-chunk", 220, 40, { size: 1000, overlap: 80 }),
        node("embed", "n-embed", 400, 40, { model: "text-embedding-3-small" }),
        node("retrieve", "n-retrieve", 220, 220, { denseTopK: 6, sparseTopK: 6, fusedTopK: 6 }),
        node("generate", "n-generate", 480, 220, { model: "gpt-4o-mini", temperature: 0.2, systemPrompt: GROUNDED_PROMPT }),
      ],
      edges: [
        edge("n-sources", "n-chunk"),
        edge("n-chunk", "n-embed"),
        edge("n-retrieve", "n-generate"),
      ],
    } satisfies WorkflowGraph,
  },
  router: {
    name: "Router",
    description: "Route the question, retrieve two corpora in parallel, merge, generate.",
    graph: {
      nodes: [
        node("sources", "n-sources", 40, 20),
        node("chunk", "n-chunk", 220, 20, { size: 800, overlap: 120 }),
        node("embed", "n-embed", 400, 20, { model: "text-embedding-3-small" }),
        node("rewrite", "n-rewrite", 40, 180, { enabled: true }),
        node(
          "route",
          "n-route",
          260,
          180,
          {
            routes: [
              { name: "policies", hint: "PTO, leave, refunds, billing, HR" },
              { name: "engineering", hint: "on-call, incidents, architecture, regions" },
              { name: "other", hint: "search every source" },
            ],
          },
        ),
        node("retrieve", "n-hr", 520, 80, {
          denseTopK: 10,
          sparseTopK: 10,
          fusedTopK: 10,
          when: "policies",
          sourceNameIncludes: ["pto", "refunds"],
        }),
        node("retrieve", "n-eng", 520, 260, {
          denseTopK: 10,
          sparseTopK: 10,
          fusedTopK: 10,
          when: "engineering",
          sourceNameIncludes: ["oncall", "architecture"],
        }),
        node("retrieve", "n-all", 520, 420, {
          denseTopK: 12,
          sparseTopK: 12,
          fusedTopK: 12,
          when: "other",
          sourceNameIncludes: [],
        }),
        node("merge", "n-merge", 780, 220, { method: "rrf" }),
        node("generate", "n-generate", 1000, 220, { model: "gpt-4o-mini", temperature: 0.1, systemPrompt: GROUNDED_PROMPT }),
      ],
      edges: [
        edge("n-sources", "n-chunk"),
        edge("n-chunk", "n-embed"),
        edge("n-rewrite", "n-route"),
        edge("n-route", "n-hr"),
        edge("n-route", "n-eng"),
        edge("n-route", "n-all"),
        edge("n-hr", "n-merge"),
        edge("n-eng", "n-merge"),
        edge("n-all", "n-merge"),
        edge("n-merge", "n-generate"),
      ],
    } satisfies WorkflowGraph,
  },
} as const;

export type TemplateId = keyof typeof workflowTemplates;
