import { z } from "zod";

export const indexKinds = ["sources", "chunk", "embed"] as const;
export const queryKinds = [
  "rewrite",
  "route",
  "retrieve",
  "grade",
  "merge",
  "rerank",
  "generate",
] as const;
export const nodeKinds = [...indexKinds, ...queryKinds] as const;

export type IndexKind = (typeof indexKinds)[number];
export type QueryKind = (typeof queryKinds)[number];
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

export const routeConfigSchema = z.object({
  routes: z
    .array(z.object({ name: z.string().min(1), hint: z.string() }))
    .min(2)
    .default([
      { name: "policies", hint: "PTO, leave, refunds, billing, HR" },
      { name: "engineering", hint: "on-call, incidents, architecture, regions" },
      { name: "other", hint: "everything else — search all sources" },
    ]),
});

export const retrieveConfigSchema = z.object({
  denseTopK: z.number().int().min(1).max(50).default(12),
  sparseTopK: z.number().int().min(1).max(50).default(12),
  fusedTopK: z.number().int().min(1).max(50).default(12),
  when: z.string().default(""),
  sourceNameIncludes: z.array(z.string()).default([]),
});

export const gradeConfigSchema = z.object({
  minScore: z.number().min(0).max(1).default(0.45),
});

export const mergeConfigSchema = z.object({
  method: z.enum(["rrf", "concat"]).default("rrf"),
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
  route: routeConfigSchema,
  retrieve: retrieveConfigSchema,
  grade: gradeConfigSchema,
  merge: mergeConfigSchema,
  rerank: rerankConfigSchema,
  generate: generateConfigSchema,
} as const;

export function defaultNodeConfig(kind: NodeKind): Record<string, unknown> {
  return nodeConfigSchemaByKind[kind].parse({});
}

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

export function isQueryKind(kind: NodeKind): kind is QueryKind {
  return (queryKinds as readonly string[]).includes(kind);
}

export function isIndexKind(kind: NodeKind): kind is IndexKind {
  return (indexKinds as readonly string[]).includes(kind);
}

export function validateGraph(graph: WorkflowGraph): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const queryNodes = graph.nodes.filter((n) => isQueryKind(n.kind));
  const retrieveCount = queryNodes.filter((n) => n.kind === "retrieve").length;
  const generateCount = queryNodes.filter((n) => n.kind === "generate").length;
  const routeCount = queryNodes.filter((n) => n.kind === "route").length;
  if (retrieveCount < 1) issues.push({ level: "error", message: "Add at least one retrieve node." });
  if (generateCount !== 1) issues.push({ level: "error", message: "Exactly one generate node is required." });
  if (routeCount > 1) issues.push({ level: "error", message: "Only one route node is allowed." });
  const ids = new Set(graph.nodes.map((n) => n.id));
  if (ids.size !== graph.nodes.length) issues.push({ level: "error", message: "Duplicate node ids." });
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      issues.push({ level: "error", message: `Edge ${edge.id} points at a missing node.` });
    }
  }
  if (hasCycle(graph)) issues.push({ level: "error", message: "The graph has a cycle." });
  if (retrieveCount > 1 && !queryNodes.some((n) => n.kind === "merge")) {
    issues.push({
      level: "warn",
      message: "Several retrieve nodes and no merge — hits are concatenated in graph order.",
    });
  }
  if (!queryNodes.some((n) => n.kind === "rerank")) {
    issues.push({ level: "warn", message: "No rerank — fused hits go to generate." });
  }
  return issues;
}

function hasCycle(graph: WorkflowGraph): boolean {
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge.target);
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

export function queryWaves(graph: WorkflowGraph): WorkflowNode[][] {
  const nodes = graph.nodes.filter((n) => isQueryKind(n.kind));
  const ids = new Set(nodes.map((n) => n.id));
  const incoming = new Map<string, string[]>();
  for (const node of nodes) incoming.set(node.id, []);
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    incoming.get(edge.target)?.push(edge.source);
  }
  const remaining = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const waves: WorkflowNode[][] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => (incoming.get(id) ?? []).every((p) => !remaining.has(p)));
    if (ready.length === 0) break;
    waves.push(ready.map((id) => byId.get(id)!));
    for (const id of ready) remaining.delete(id);
  }
  return waves;
}

export function nodeByKind(graph: WorkflowGraph, kind: NodeKind): WorkflowNode | undefined {
  return graph.nodes.find((n) => n.kind === kind);
}

export function parseNodeConfig<K extends NodeKind>(kind: K, config: Record<string, unknown>) {
  return nodeConfigSchemaByKind[kind].parse(config) as z.infer<(typeof nodeConfigSchemaByKind)[K]>;
}
