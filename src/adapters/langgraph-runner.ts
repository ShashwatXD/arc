import "server-only";

import { z } from "zod";
import { ArcError, parseNodeConfig, queryWaves, validateGraph } from "@/domain";
import { buildGenerateMessages } from "@/domain/prompt";
import type { Citation, TraceStep } from "@/domain/models";
import type { WorkflowNode } from "@/domain/workflow";
import type {
  EmbedderPort,
  LlmPort,
  RetrievalPort,
  RetrieveInput,
  RetrieveResult,
  RetrievedChunk,
  RerankerPort,
  WorkflowRunnerPort,
} from "@/domain/ports";
import * as repos from "@/adapters/db/repos";

const routeSchema = z.object({ route: z.string() });
const gradeSchema = z.object({ keep: z.array(z.number().int()) });

type RunnerDeps = {
  llm: LlmPort;
  embedder: EmbedderPort;
  retrieval: RetrievalPort;
  reranker: RerankerPort;
};

type RunState = {
  workspaceId: string;
  question: string;
  history: RetrieveInput["history"];
  query: string;
  rewritten: string | null;
  route: string | null;
  chunks: RetrievedChunk[];
  buckets: Record<string, RetrievedChunk[]>;
  citations: Citation[];
  steps: TraceStep[];
  generateConfig: RetrieveResult["generateConfig"];
  prompt: RetrieveResult["prompt"];
};

function rrfMerge(lists: RetrievedChunk[][], k = 60): RetrievedChunk[] {
  const scores = new Map<string, { chunk: RetrievedChunk; score: number }>();
  for (const list of lists) {
    list.forEach((chunk, rank) => {
      const add = 1 / (k + rank + 1);
      const prev = scores.get(chunk.id);
      if (prev) prev.score += add;
      else scores.set(chunk.id, { chunk, score: add });
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map((row) => ({ ...row.chunk, score: row.score }));
}

function uniqueConcat(list: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  for (const chunk of list) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    out.push(chunk);
  }
  return out;
}

function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((chunk, index) => ({
    chunkId: chunk.id,
    sourceId: chunk.sourceId,
    sourceName: chunk.sourceName,
    ordinal: index,
    text: chunk.text,
    score: chunk.score,
  }));
}

export function createLangGraphRunner(deps: RunnerDeps): WorkflowRunnerPort {
  return {
    async retrieve(input: RetrieveInput): Promise<RetrieveResult> {
      const workspace = await repos.getWorkspace(input.workspaceId);
      if (!workspace) throw new ArcError("Workspace not found.", "not_found", 404);
      const workflowId = input.workflowId ?? workspace.activeWorkflowId;
      if (!workflowId) throw new ArcError("No active workflow.", "no_workflow");
      const workflow = await repos.getWorkflow(workflowId);
      if (!workflow) throw new ArcError("Workflow not found.", "not_found", 404);

      const issues = validateGraph(workflow.graph).filter((issue) => issue.level === "error");
      if (issues.length) throw new ArcError(issues[0].message, "invalid_graph");

      const generateNode = workflow.graph.nodes.find((n) => n.kind === "generate");
      const generateCfg = parseNodeConfig("generate", generateNode?.config ?? {});

      const state: RunState = {
        workspaceId: input.workspaceId,
        question: input.question,
        history: input.history,
        query: input.question,
        rewritten: null,
        route: null,
        chunks: [],
        buckets: {},
        citations: [],
        steps: [],
        generateConfig: generateCfg,
        prompt: [],
      };

      const emit = async (step: TraceStep) => {
        state.steps.push(step);
        await input.onStep?.(step);
      };
      const startNode = async (node: WorkflowNode) => {
        await input.onNodeStart?.({ nodeId: node.id, kind: node.kind });
      };

      for (const wave of queryWaves(workflow.graph)) {
        await Promise.all(wave.map((node) => runNode(deps, node, state, emit, startNode)));
        const retrieves = wave.filter((n) => n.kind === "retrieve");
        if (retrieves.length > 1 && !workflow.graph.nodes.some((n) => n.kind === "merge")) {
          state.chunks = uniqueConcat(retrieves.flatMap((n) => state.buckets[n.id] ?? []));
        }
      }

      return {
        question: input.question,
        rewritten: state.rewritten,
        chunks: state.chunks,
        citations: state.citations,
        traceSteps: state.steps,
        generateConfig: state.generateConfig,
        prompt: state.prompt,
      };
    },
  };
}

async function runNode(
  deps: RunnerDeps,
  node: WorkflowNode,
  state: RunState,
  emit: (step: TraceStep) => Promise<void>,
  startNode: (node: WorkflowNode) => Promise<void>,
) {
  const startedAt = Date.now();
  await startNode(node);
  const finish = (status: TraceStep["status"], detail: string, data?: Record<string, unknown>) =>
    emit({
      name: node.kind,
      nodeId: node.id,
      startedAt,
      durationMs: Date.now() - startedAt,
      detail,
      status,
      data,
    });

  if (node.kind === "rewrite") {
    const cfg = parseNodeConfig("rewrite", node.config);
    if (!cfg.enabled) {
      state.query = state.question;
      await finish("skip", "rewrite off");
      return;
    }
    const rewritten =
      (
        await deps.llm.complete({
          model: state.generateConfig.model,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "Rewrite the user question as a standalone search query for a document index. Keep names, numbers, and constraints. Return only the query.",
            },
            {
              role: "user",
              content: state.history.length
                ? `History:\n${state.history.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\nQuestion: ${state.question}`
                : state.question,
            },
          ],
        })
      ).trim() || state.question;
    state.rewritten = rewritten;
    state.query = rewritten;
    await finish("ok", rewritten);
    return;
  }

  if (node.kind === "route") {
    const cfg = parseNodeConfig("route", node.config);
    const names = cfg.routes.map((r) => r.name);
    const catalog = cfg.routes.map((r) => `- ${r.name}: ${r.hint}`).join("\n");
    const raw = await deps.llm.complete({
      model: state.generateConfig.model,
      temperature: 0,
      json: true,
      messages: [
        { role: "system", content: `Pick one route name. JSON {"route": string}.\n${catalog}` },
        { role: "user", content: state.question },
      ],
    });
    let picked = names[names.length - 1] ?? "other";
    try {
      const parsed = routeSchema.safeParse(JSON.parse(raw));
      if (parsed.success && names.includes(parsed.data.route)) picked = parsed.data.route;
    } catch {
      /* keep fallback */
    }
    state.route = picked;
    await finish("ok", `→ ${picked}`, { route: picked, options: names });
    return;
  }

  if (node.kind === "retrieve") {
    const cfg = parseNodeConfig("retrieve", node.config);
    if (cfg.when && state.route && cfg.when !== state.route) {
      state.buckets[node.id] = [];
      await finish("skip", `route is ${state.route}`);
      return;
    }
    const query = state.query || state.question;
    const [queryVector] = await deps.embedder.embed([query]);
    let chunks = await deps.retrieval.search({
      workspaceId: state.workspaceId,
      query,
      queryVector,
      denseTopK: cfg.denseTopK,
      sparseTopK: cfg.sparseTopK,
      fusedTopK: cfg.fusedTopK,
    });
    const needles = cfg.sourceNameIncludes.map((s) => s.toLowerCase()).filter(Boolean);
    if (needles.length) {
      chunks = chunks.filter((chunk) =>
        needles.some((needle) => chunk.sourceName.toLowerCase().includes(needle)),
      );
    }
    state.buckets[node.id] = chunks;
    state.chunks = chunks;
    await finish("ok", `${chunks.length} chunks`, {
      sources: [...new Set(chunks.map((c) => c.sourceName))],
      scores: chunks.map((c) => Number(c.score.toFixed(3))),
    });
    return;
  }

  if (node.kind === "merge") {
    const cfg = parseNodeConfig("merge", node.config);
    const lists = Object.values(state.buckets);
    const chunks = cfg.method === "concat" ? uniqueConcat(lists.flat()) : rrfMerge(lists);
    state.chunks = chunks;
    await finish("ok", `${cfg.method} → ${chunks.length} chunks`);
    return;
  }

  if (node.kind === "grade") {
    const cfg = parseNodeConfig("grade", node.config);
    if (state.chunks.length === 0) {
      await finish("skip", "no chunks");
      return;
    }
    const listed = state.chunks
      .map((chunk, i) => `[${i + 1}] ${chunk.sourceName}: ${chunk.text.slice(0, 500)}`)
      .join("\n");
    const raw = await deps.llm.complete({
      model: state.generateConfig.model,
      temperature: 0,
      json: true,
      messages: [
        {
          role: "system",
          content: `Return JSON {"keep": number[]} of 1-based indexes that are relevant to the question. Drop the rest. Prefer precision.`,
        },
        { role: "user", content: `Question: ${state.question}\n\nChunks:\n${listed}` },
      ],
    });
    let keep = state.chunks.map((_, i) => i + 1);
    try {
      const parsed = gradeSchema.safeParse(JSON.parse(raw));
      if (parsed.success) keep = parsed.data.keep;
    } catch {
      /* keep all */
    }
    const before = state.chunks.length;
    const filtered = state.chunks.filter((_, i) => keep.includes(i + 1));
    state.chunks = filtered.length > 0 ? filtered : state.chunks;
    await finish("ok", `kept ${state.chunks.length}/${before}`, { keep, minScore: cfg.minScore });
    return;
  }

  if (node.kind === "rerank") {
    const cfg = parseNodeConfig("rerank", node.config);
    if (!cfg.enabled) {
      await finish("skip", "rerank off");
      return;
    }
    if (state.chunks.length === 0) {
      await finish("skip", "no chunks");
      return;
    }
    const reranked = await deps.reranker.rerank(
      state.query || state.question,
      state.chunks,
      cfg.topN,
      state.generateConfig.model,
    );
    const byId = new Map(state.chunks.map((chunk) => [chunk.id, chunk]));
    state.chunks = reranked.map((chunk, index) => {
      const prev = byId.get(chunk.id);
      return {
        ...chunk,
        sourceName: prev?.sourceName ?? ("sourceName" in chunk ? String(chunk.sourceName) : "source"),
        score: prev?.score ?? 1 - index / 100,
        workspaceId: prev?.workspaceId ?? state.workspaceId,
        ordinal: prev?.ordinal ?? index,
        embedding: prev?.embedding ?? null,
      } as RetrievedChunk;
    });
    await finish("ok", `listwise top ${state.chunks.length}`);
    return;
  }

  if (node.kind === "generate") {
    const cfg = parseNodeConfig("generate", node.config);
    state.generateConfig = cfg;
    state.citations = toCitations(state.chunks);
    state.prompt = buildGenerateMessages(state.question, state.chunks, cfg.systemPrompt, state.history);
    await finish("ok", `${state.chunks.length} sources in prompt`);
  }
}
