import "server-only";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ArcError, ConfigError, nodeByKind, parseNodeConfig, validateGraph } from "@/domain";
import { buildGenerateMessages } from "@/domain/prompt";
import type { Citation, TraceStep } from "@/domain/models";
import type {
  EmbedderPort,
  LlmMessage,
  LlmPort,
  RetrievalPort,
  RetrieveInput,
  RetrieveResult,
  RetrievedChunk,
  RerankerPort,
  WorkflowRunnerPort,
} from "@/domain/ports";
import * as repos from "@/adapters/db/repos";

const RagState = Annotation.Root({
  workspaceId: Annotation<string>(),
  question: Annotation<string>(),
  history: Annotation<LlmMessage[]>({
    reducer: (_current: LlmMessage[], update: LlmMessage[]) => update,
    default: () => [],
  }),
  query: Annotation<string>(),
  rewritten: Annotation<string | null>({
    reducer: (_current: string | null, update: string | null) => update,
    default: () => null,
  }),
  chunks: Annotation<RetrievedChunk[]>({
    reducer: (_current: RetrievedChunk[], update: RetrievedChunk[]) => update,
    default: () => [],
  }),
  citations: Annotation<Citation[]>({
    reducer: (_current: Citation[], update: Citation[]) => update,
    default: () => [],
  }),
  steps: Annotation<TraceStep[]>({
    reducer: (current: TraceStep[], update: TraceStep[]) => current.concat(update),
    default: () => [],
  }),
  generateConfig: Annotation<RetrieveResult["generateConfig"]>(),
  prompt: Annotation<LlmMessage[]>({
    reducer: (_current: LlmMessage[], update: LlmMessage[]) => update,
    default: () => [],
  }),
});

function timed() {
  const startedAt = Date.now();
  return {
    done(name: TraceStep["name"], detail: string, data?: Record<string, unknown>): TraceStep {
      return { name, startedAt, durationMs: Date.now() - startedAt, detail, data };
    },
  };
}

type RunnerDeps = {
  llm: LlmPort;
  embedder: EmbedderPort;
  retrieval: RetrievalPort;
  reranker: RerankerPort;
};

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

      const rewriteNode = nodeByKind(workflow.graph, "rewrite");
      const retrieveNode = nodeByKind(workflow.graph, "retrieve");
      const rerankNode = nodeByKind(workflow.graph, "rerank");
      const generateNode = nodeByKind(workflow.graph, "generate");

      const rewriteCfg = parseNodeConfig("rewrite", rewriteNode?.config ?? { enabled: false });
      const retrieveCfg = parseNodeConfig("retrieve", retrieveNode?.config ?? {});
      const rerankCfg = parseNodeConfig("rerank", rerankNode?.config ?? { enabled: false });
      const generateCfg = parseNodeConfig("generate", generateNode?.config ?? {});
      const useRewrite = Boolean(rewriteNode && rewriteCfg.enabled);
      const useRerank = Boolean(rerankNode && rerankCfg.enabled);

      if (useRerank && !deps.reranker.available) {
        throw new ConfigError("Rerank is enabled on this workflow but COHERE_API_KEY is missing.");
      }

      const compiled = new StateGraph(RagState)
        .addNode("rewrite", async (state) => {
          if (!useRewrite) {
            return { query: state.question, rewritten: null as string | null };
          }
          const clock = timed();
          const rewritten =
            (
              await deps.llm.complete({
                model: generateCfg.model,
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
          return {
            rewritten,
            query: rewritten,
            steps: [clock.done("rewrite", rewritten)],
          };
        })
        .addNode("retrieve", async (state) => {
          const clock = timed();
          const query = state.query || state.question;
          const [queryVector] = await deps.embedder.embed([query]);
          const chunks = await deps.retrieval.search({
            workspaceId: state.workspaceId,
            query,
            queryVector,
            denseTopK: retrieveCfg.denseTopK,
            sparseTopK: retrieveCfg.sparseTopK,
            fusedTopK: retrieveCfg.fusedTopK,
          });
          return {
            chunks,
            steps: [
              clock.done("retrieve", `Qdrant hybrid RRF → ${chunks.length} chunks`, {
                ids: chunks.map((chunk) => chunk.id),
                scores: chunks.map((chunk) => chunk.score),
              }),
            ],
          };
        })
        .addNode("rerank", async (state) => {
          if (!useRerank) return {};
          const clock = timed();
          if (state.chunks.length === 0) {
            return { steps: [clock.done("rerank", "no chunks")] };
          }
          const reranked = await deps.reranker.rerank(
            state.query || state.question,
            state.chunks,
            rerankCfg.topN,
          );
          const scoreById = new Map(state.chunks.map((chunk) => [chunk.id, chunk.score]));
          const chunks: RetrievedChunk[] = reranked.map((chunk, index) => ({
            ...chunk,
            sourceName:
              "sourceName" in chunk && typeof chunk.sourceName === "string"
                ? chunk.sourceName
                : state.chunks.find((item) => item.id === chunk.id)?.sourceName ?? "source",
            score: scoreById.get(chunk.id) ?? 1 - index / 100,
          }));
          return {
            chunks,
            steps: [clock.done("rerank", `Cohere top ${chunks.length}`)],
          };
        })
        .addNode("prepare", async (state) => {
          const citations: Citation[] = state.chunks.map((chunk, index) => ({
            chunkId: chunk.id,
            sourceId: chunk.sourceId,
            sourceName: chunk.sourceName,
            ordinal: index,
            text: chunk.text,
            score: chunk.score,
          }));
          return {
            citations,
            generateConfig: generateCfg,
            prompt: buildGenerateMessages(
              state.question,
              state.chunks,
              generateCfg.systemPrompt,
              state.history,
            ),
          };
        })
        .addEdge(START, "rewrite")
        .addEdge("rewrite", "retrieve")
        .addEdge("retrieve", "rerank")
        .addEdge("rerank", "prepare")
        .addEdge("prepare", END)
        .compile();

      const result = await compiled.invoke({
        workspaceId: input.workspaceId,
        question: input.question,
        history: input.history,
        query: input.question,
        rewritten: null,
        chunks: [],
        citations: [],
        steps: [],
        prompt: [],
        generateConfig: generateCfg,
      });

      return {
        question: input.question,
        rewritten: result.rewritten,
        chunks: result.chunks,
        citations: result.citations,
        traceSteps: result.steps,
        generateConfig: result.generateConfig,
        prompt: result.prompt,
      };
    },
  };
}
