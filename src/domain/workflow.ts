import { z } from "zod";

export const nodeKinds = [
  "sources",
  "chunk",
  "embed",
  "rewrite",
  "retrieve",
  "rerank",
  "generate",
] as const;

export type NodeKind = (typeof nodeKinds)[number];

export const chunkConfigSchema = z.object({
  size: z.number().int().min(200).max(4000).default(800),
  overlap: z.number().int().min(0).max(800).default(120),
});

export const embedConfigSchema = z.object({
  model: z.string().default("text-embedding-3-small"),
});

export const rewriteConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

export const retrieveConfigSchema = z.object({
  denseTopK: z.number().int().min(1).max(50).default(12),
  sparseTopK: z.number().int().min(1).max(50).default(12),
  fusedTopK: z.number().int().min(1).max(50).default(12),
});

export const rerankConfigSchema = z.object({
  enabled: z.boolean().default(true),
  topN: z.number().int().min(1).max(20).default(6),
});

export const generateConfigSchema = z.object({
  model: z.string().default("gpt-4o-mini"),
  temperature: z.number().min(0).max(1).default(0.1),
  systemPrompt: z.string().default(
    "You are Arc, a grounded assistant. Answer only from the provided sources. Cite claims as [n] matching the source list. If the sources are insufficient, say you do not know and what is missing. Never invent sources or citations.",
  ),
});

export const nodeConfigSchemaByKind = {
  sources: z.object({}),
  chunk: chunkConfigSchema,
  embed: embedConfigSchema,
  rewrite: rewriteConfigSchema,
  retrieve: retrieveConfigSchema,
  rerank: rerankConfigSchema,
  generate: generateConfigSchema,
} as const;

export const workflowNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(nodeKinds),
  position: z.object({ x: z.number(), y: z.number() }),
  config: z.record(z.string(), z.unknown()),
});

export const workflowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
});

export const workflowGraphSchema = z.object({
  nodes: z.array(workflowNodeSchema).min(1),
  edges: z.array(workflowEdgeSchema),
});

export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof workflowEdgeSchema>;

export type Workflow = {
  id: string;
  workspaceId: string;
  name: string;
  graph: WorkflowGraph;
  createdAt: number;
  isActive: boolean;
};

export type WorkflowIssue = { level: "error" | "warn"; message: string };

export function validateGraph(graph: WorkflowGraph): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const kinds = graph.nodes.map((n) => n.kind);
  const counts = new Map<NodeKind, number>();
  for (const kind of kinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  for (const [kind, count] of counts) {
    if (count > 1) {
      issues.push({ level: "error", message: `Only one ${kind} node is allowed.` });
    }
  }
  if (!counts.get("retrieve")) {
    issues.push({ level: "error", message: "A retrieve node is required." });
  }
  if (!counts.get("generate")) {
    issues.push({ level: "error", message: "A generate node is required." });
  }
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      issues.push({ level: "error", message: `Edge ${edge.id} points at a missing node.` });
    }
  }
  if (hasCycle(graph)) {
    issues.push({ level: "error", message: "The graph has a cycle." });
  }
  if (!counts.get("rerank")) {
    issues.push({
      level: "warn",
      message: "No rerank node — hybrid hits go straight to the model.",
    });
  }
  return issues;
}

function hasCycle(graph: WorkflowGraph): boolean {
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) {
    outgoing.get(edge.source)?.push(edge.target);
  }
  const visiting = new Set<string>();
  const seen = new Set<string>();
  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (seen.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) {
      if (dfs(next)) return true;
    }
    visiting.delete(id);
    seen.add(id);
    return false;
  };
  return graph.nodes.some((n) => dfs(n.id));
}

export function nodeByKind(graph: WorkflowGraph, kind: NodeKind): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.kind === kind);
}

export function parseNodeConfig<K extends NodeKind>(kind: K, config: Record<string, unknown>) {
  return nodeConfigSchemaByKind[kind].parse(config) as z.infer<(typeof nodeConfigSchemaByKind)[K]>;
}
