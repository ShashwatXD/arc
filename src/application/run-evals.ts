import "server-only";

import { z } from "zod";
import { ArcError, newId } from "@/domain";
import type { EvalMetrics, EvalResult } from "@/domain/models";
import * as repos from "@/adapters/db/repos";
import { persistTrace } from "./run-workflow";
import { getServices } from "@/lib/composition";

const judgeSchema = z.object({
  score: z.number().min(0).max(1),
  reason: z.string(),
});

function citationPrecision(answer: string, citationCount: number): number {
  const markers = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  if (markers.length === 0) {
    const unsure = /do not know|don't know|not in the sources|insufficient/i.test(answer);
    return unsure ? 1 : citationCount === 0 ? 1 : 0.2;
  }
  const valid = markers.filter((n) => n >= 1 && n <= citationCount).length;
  return valid / markers.length;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function judge(
  model: string,
  kind: "faithfulness" | "relevancy",
  question: string,
  answer: string,
  context: string,
) {
  const { llm } = getServices();
  const prompt =
    kind === "faithfulness"
      ? `Score 0-1 whether EVERY claim in the ANSWER is supported by CONTEXT. Invented facts = 0. JSON {"score": number, "reason": string}.\n\nCONTEXT:\n${context}\n\nANSWER:\n${answer}`
      : `Score 0-1 whether the ANSWER addresses the QUESTION. JSON {"score": number, "reason": string}.\n\nQUESTION:\n${question}\n\nANSWER:\n${answer}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llm.complete({
        model,
        temperature: 0,
        json: true,
        messages: [
          { role: "system", content: "Return only valid JSON." },
          { role: "user", content: prompt },
        ],
      });
      return judgeSchema.parse(JSON.parse(raw));
    } catch (error) {
      lastError = error;
    }
  }
  throw new ArcError(
    `Eval judge (${kind}) failed: ${lastError instanceof Error ? lastError.message : "invalid JSON"}`,
    "eval_judge_failed",
    502,
  );
}

export async function runEvalSuite(input: { workspaceId: string; datasetId: string; workflowId?: string }) {
  const workspace = await repos.getWorkspace(input.workspaceId);
  if (!workspace) throw new ArcError("Workspace not found.", "not_found", 404);
  const dataset = (await repos.listDatasets(input.workspaceId)).find((d) => d.id === input.datasetId);
  if (!dataset) throw new ArcError("Dataset not found.", "not_found", 404);
  const items = await repos.listEvalItems(input.datasetId);
  if (items.length === 0) throw new ArcError("Dataset has no questions.", "empty_dataset");

  const workflowId = input.workflowId ?? workspace.activeWorkflowId;
  if (!workflowId) throw new ArcError("No active workflow.", "no_workflow");
  const workflow = await repos.getWorkflow(workflowId);
  if (!workflow) throw new ArcError("Workflow not found.", "not_found", 404);

  const run = {
    id: newId("evalRun"),
    datasetId: dataset.id,
    workspaceId: input.workspaceId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    startedAt: Date.now(),
    finishedAt: null,
    metrics: null,
    error: null,
  };
  await repos.insertEvalRun(run);

  const { runner, llm } = getServices();
  const results: EvalResult[] = [];

  try {
    for (const item of items) {
      const retrieved = await runner.retrieve({
        workspaceId: input.workspaceId,
        question: item.question,
        history: [],
        workflowId: workflow.id,
      });
      const clock = Date.now();
      const answer = await llm.complete({
        model: retrieved.generateConfig.model,
        temperature: retrieved.generateConfig.temperature,
        messages: retrieved.prompt,
      });
      retrieved.traceSteps.push({
        name: "generate",
        startedAt: clock,
        durationMs: Date.now() - clock,
        detail: `${answer.length} chars`,
      });
      const trace = await persistTrace({
        workspaceId: input.workspaceId,
        kind: "eval",
        question: item.question,
        rewritten: retrieved.rewritten,
        steps: retrieved.traceSteps,
        citationCount: retrieved.citations.length,
      });
      const context = retrieved.chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n");
      const faith = await judge(retrieved.generateConfig.model, "faithfulness", item.question, answer, context);
      const rel = await judge(retrieved.generateConfig.model, "relevancy", item.question, answer, context);
      const cite = citationPrecision(answer, retrieved.citations.length);
      const scores: EvalMetrics = {
        faithfulness: faith.score,
        relevancy: rel.score,
        citationPrecision: cite,
      };
      const passed = scores.faithfulness >= 0.7 && scores.relevancy >= 0.7 && scores.citationPrecision >= 0.5;
      const result: EvalResult = {
        id: newId("evalResult"),
        runId: run.id,
        itemId: item.id,
        question: item.question,
        expectedAnswer: item.expectedAnswer,
        answer,
        scores,
        passed,
        citations: retrieved.citations,
        traceId: trace.id,
        reason: `${faith.reason} ${rel.reason}`.trim(),
      };
      await repos.insertEvalResult(result);
      results.push(result);
    }
    const metrics: EvalMetrics = {
      faithfulness: avg(results.map((r) => r.scores.faithfulness)),
      relevancy: avg(results.map((r) => r.scores.relevancy)),
      citationPrecision: avg(results.map((r) => r.scores.citationPrecision)),
    };
    await repos.finishEvalRun(run.id, metrics, null);
    return { run: { ...run, finishedAt: Date.now(), metrics }, results };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Eval failed.";
    await repos.finishEvalRun(run.id, null, message);
    throw error;
  }
}
