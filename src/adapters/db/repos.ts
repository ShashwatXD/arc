import "server-only";

import { desc, eq, inArray } from "drizzle-orm";
import type {
  Chunk,
  Conversation,
  EvalDataset,
  EvalItem,
  EvalResult,
  EvalRun,
  Message,
  Source,
  Trace,
  Workflow,
  Workspace,
} from "@/domain";
import { workflowGraphSchema } from "@/domain/workflow";
import { getDb } from "./client";
import * as t from "./schema";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const db = await getDb();
  const rows = await db.select().from(t.workspaces).orderBy(desc(t.workspaces.updatedAt));
  return rows.map(mapWorkspace);
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const db = await getDb();
  const rows = await db.select().from(t.workspaces).where(eq(t.workspaces.id, id)).limit(1);
  return rows[0] ? mapWorkspace(rows[0]) : null;
}

export async function insertWorkspace(ws: Workspace) {
  const db = await getDb();
  await db.insert(t.workspaces).values({
    id: ws.id,
    name: ws.name,
    description: ws.description,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
    activeWorkflowId: ws.activeWorkflowId,
    isSample: ws.isSample,
  });
}

export async function updateWorkspace(
  id: string,
  patch: Partial<Pick<Workspace, "name" | "description" | "activeWorkflowId" | "updatedAt">>,
) {
  const db = await getDb();
  await db.update(t.workspaces).set(patch).where(eq(t.workspaces.id, id));
}

export async function deleteWorkspace(id: string) {
  const db = await getDb();
  const convos = await db.select({ id: t.conversations.id }).from(t.conversations).where(eq(t.conversations.workspaceId, id));
  const datasets = await db.select({ id: t.evalDatasets.id }).from(t.evalDatasets).where(eq(t.evalDatasets.workspaceId, id));
  const runs = await db.select({ id: t.evalRuns.id }).from(t.evalRuns).where(eq(t.evalRuns.workspaceId, id));
  const convoIds = convos.map((row) => row.id);
  const datasetIds = datasets.map((row) => row.id);
  const runIds = runs.map((row) => row.id);
  if (convoIds.length) await db.delete(t.messages).where(inArray(t.messages.conversationId, convoIds));
  if (datasetIds.length) await db.delete(t.evalItems).where(inArray(t.evalItems.datasetId, datasetIds));
  if (runIds.length) await db.delete(t.evalResults).where(inArray(t.evalResults.runId, runIds));
  await db.delete(t.chunks).where(eq(t.chunks.workspaceId, id));
  await db.delete(t.sources).where(eq(t.sources.workspaceId, id));
  await db.delete(t.workflows).where(eq(t.workflows.workspaceId, id));
  await db.delete(t.conversations).where(eq(t.conversations.workspaceId, id));
  await db.delete(t.evalDatasets).where(eq(t.evalDatasets.workspaceId, id));
  await db.delete(t.evalRuns).where(eq(t.evalRuns.workspaceId, id));
  await db.delete(t.traces).where(eq(t.traces.workspaceId, id));
  await db.delete(t.workspaces).where(eq(t.workspaces.id, id));
}

function mapWorkspace(row: typeof t.workspaces.$inferSelect): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activeWorkflowId: row.activeWorkflowId,
    isSample: row.isSample,
  };
}

export async function listSources(workspaceId: string): Promise<Source[]> {
  const db = await getDb();
  const rows = await db.select().from(t.sources).where(eq(t.sources.workspaceId, workspaceId));
  return rows.map(mapSource);
}

export async function getSource(id: string): Promise<Source | null> {
  const db = await getDb();
  const rows = await db.select().from(t.sources).where(eq(t.sources.id, id)).limit(1);
  return rows[0] ? mapSource(rows[0]) : null;
}

export async function insertSource(source: Source) {
  const db = await getDb();
  await db.insert(t.sources).values(source);
}

export async function updateSource(id: string, patch: Partial<Source>) {
  const db = await getDb();
  await db.update(t.sources).set(patch).where(eq(t.sources.id, id));
}

export async function deleteSource(id: string) {
  const db = await getDb();
  await db.delete(t.chunks).where(eq(t.chunks.sourceId, id));
  await db.delete(t.sources).where(eq(t.sources.id, id));
}

function mapSource(row: typeof t.sources.$inferSelect): Source {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as Source["kind"],
    name: row.name,
    status: row.status as Source["status"],
    byteSize: row.byteSize,
    rawText: row.rawText,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function replaceChunks(sourceId: string, chunks: Chunk[]) {
  const db = await getDb();
  await db.delete(t.chunks).where(eq(t.chunks.sourceId, sourceId));
  if (chunks.length === 0) return;
  await db.insert(t.chunks).values(
    chunks.map((c) => ({
      id: c.id,
      sourceId: c.sourceId,
      workspaceId: c.workspaceId,
      ordinal: c.ordinal,
      text: c.text,
      embeddingJson: c.embedding ? JSON.stringify(c.embedding) : null,
    })),
  );
}

export async function listChunks(workspaceId: string): Promise<Chunk[]> {
  const db = await getDb();
  const rows = await db.select().from(t.chunks).where(eq(t.chunks.workspaceId, workspaceId));
  return rows.map(mapChunk);
}

export async function listChunksForSource(sourceId: string): Promise<Chunk[]> {
  const db = await getDb();
  const rows = await db.select().from(t.chunks).where(eq(t.chunks.sourceId, sourceId));
  return rows.map(mapChunk);
}

function mapChunk(row: typeof t.chunks.$inferSelect): Chunk {
  return {
    id: row.id,
    sourceId: row.sourceId,
    workspaceId: row.workspaceId,
    ordinal: row.ordinal,
    text: row.text,
    embedding: row.embeddingJson ? parseJson<number[]>(row.embeddingJson, []) : null,
  };
}

export async function listWorkflows(workspaceId: string): Promise<Workflow[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(t.workflows)
    .where(eq(t.workflows.workspaceId, workspaceId))
    .orderBy(desc(t.workflows.createdAt));
  return rows.map(mapWorkflow);
}

export async function listAllWorkflows(): Promise<Workflow[]> {
  const db = await getDb();
  const rows = await db.select().from(t.workflows).orderBy(desc(t.workflows.createdAt));
  return rows.map(mapWorkflow);
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  const db = await getDb();
  const rows = await db.select().from(t.workflows).where(eq(t.workflows.id, id)).limit(1);
  return rows[0] ? mapWorkflow(rows[0]) : null;
}

export async function insertWorkflow(wf: Workflow) {
  const db = await getDb();
  await db.insert(t.workflows).values({
    id: wf.id,
    workspaceId: wf.workspaceId,
    name: wf.name,
    graphJson: JSON.stringify(wf.graph),
    createdAt: wf.createdAt,
    isActive: wf.isActive,
  });
}

export async function saveWorkflowGraph(id: string, graph: Workflow["graph"], name?: string) {
  const db = await getDb();
  await db
    .update(t.workflows)
    .set({ graphJson: JSON.stringify(graph), ...(name ? { name } : {}) })
    .where(eq(t.workflows.id, id));
}

export async function setActiveWorkflow(workspaceId: string, workflowId: string) {
  const db = await getDb();
  const all = await db.select().from(t.workflows).where(eq(t.workflows.workspaceId, workspaceId));
  for (const row of all) {
    await db
      .update(t.workflows)
      .set({ isActive: row.id === workflowId })
      .where(eq(t.workflows.id, row.id));
  }
  await db
    .update(t.workspaces)
    .set({ activeWorkflowId: workflowId, updatedAt: Date.now() })
    .where(eq(t.workspaces.id, workspaceId));
}

function mapWorkflow(row: typeof t.workflows.$inferSelect): Workflow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    graph: workflowGraphSchema.parse(parseJson(row.graphJson, { nodes: [], edges: [] })),
    createdAt: row.createdAt,
    isActive: row.isActive,
  };
}

export async function listConversations(workspaceId: string): Promise<Conversation[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(t.conversations)
    .where(eq(t.conversations.workspaceId, workspaceId))
    .orderBy(desc(t.conversations.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function insertConversation(c: Conversation) {
  const db = await getDb();
  await db.insert(t.conversations).values(c);
}

export async function updateConversationTitle(id: string, title: string, updatedAt: number) {
  const db = await getDb();
  await db.update(t.conversations).set({ title, updatedAt }).where(eq(t.conversations.id, id));
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const db = await getDb();
  const rows = await db.select().from(t.messages).where(eq(t.messages.conversationId, conversationId));
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as Message["role"],
    content: row.content,
    citations: parseJson(row.citationsJson, []),
    traceId: row.traceId,
    createdAt: row.createdAt,
  }));
}

export async function insertMessage(m: Message) {
  const db = await getDb();
  await db.insert(t.messages).values({
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    citationsJson: JSON.stringify(m.citations),
    traceId: m.traceId,
    createdAt: m.createdAt,
  });
}

export async function listDatasets(workspaceId: string): Promise<EvalDataset[]> {
  const db = await getDb();
  const rows = await db.select().from(t.evalDatasets).where(eq(t.evalDatasets.workspaceId, workspaceId));
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    createdAt: row.createdAt,
  }));
}

export async function insertDataset(d: EvalDataset) {
  const db = await getDb();
  await db.insert(t.evalDatasets).values(d);
}

export async function listEvalItems(datasetId: string): Promise<EvalItem[]> {
  const db = await getDb();
  const rows = await db.select().from(t.evalItems).where(eq(t.evalItems.datasetId, datasetId));
  return rows.map((row) => ({
    id: row.id,
    datasetId: row.datasetId,
    question: row.question,
    expectedAnswer: row.expectedAnswer,
  }));
}

export async function replaceEvalItems(datasetId: string, items: EvalItem[]) {
  const db = await getDb();
  await db.delete(t.evalItems).where(eq(t.evalItems.datasetId, datasetId));
  if (items.length === 0) return;
  await db.insert(t.evalItems).values(items);
}

export async function insertEvalItem(item: EvalItem) {
  const db = await getDb();
  await db.insert(t.evalItems).values(item);
}

export async function deleteEvalItem(id: string) {
  const db = await getDb();
  await db.delete(t.evalItems).where(eq(t.evalItems.id, id));
}

export async function insertEvalRun(run: EvalRun) {
  const db = await getDb();
  await db.insert(t.evalRuns).values({
    id: run.id,
    datasetId: run.datasetId,
    workspaceId: run.workspaceId,
    workflowId: run.workflowId,
    workflowName: run.workflowName,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    metricsJson: run.metrics ? JSON.stringify(run.metrics) : null,
    error: run.error,
  });
}

export async function finishEvalRun(id: string, metrics: EvalRun["metrics"], error: string | null) {
  const db = await getDb();
  await db
    .update(t.evalRuns)
    .set({ finishedAt: Date.now(), metricsJson: metrics ? JSON.stringify(metrics) : null, error })
    .where(eq(t.evalRuns.id, id));
}

export async function listEvalRuns(workspaceId: string): Promise<EvalRun[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(t.evalRuns)
    .where(eq(t.evalRuns.workspaceId, workspaceId))
    .orderBy(desc(t.evalRuns.startedAt));
  return rows.map((row) => ({
    id: row.id,
    datasetId: row.datasetId,
    workspaceId: row.workspaceId,
    workflowId: row.workflowId,
    workflowName: row.workflowName,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    metrics: row.metricsJson ? parseJson(row.metricsJson, null) : null,
    error: row.error,
  }));
}

export async function insertEvalResult(result: EvalResult) {
  const db = await getDb();
  await db.insert(t.evalResults).values({
    id: result.id,
    runId: result.runId,
    itemId: result.itemId,
    question: result.question,
    expectedAnswer: result.expectedAnswer,
    answer: result.answer,
    scoresJson: JSON.stringify(result.scores),
    passed: result.passed,
    citationsJson: JSON.stringify(result.citations),
    traceId: result.traceId,
    reason: result.reason,
  });
}

export async function listEvalResults(runId: string): Promise<EvalResult[]> {
  const db = await getDb();
  const rows = await db.select().from(t.evalResults).where(eq(t.evalResults.runId, runId));
  return rows.map((row) => ({
    id: row.id,
    runId: row.runId,
    itemId: row.itemId,
    question: row.question,
    expectedAnswer: row.expectedAnswer,
    answer: row.answer,
    scores: parseJson(row.scoresJson, { faithfulness: 0, relevancy: 0, citationPrecision: 0 }),
    passed: row.passed,
    citations: parseJson(row.citationsJson, []),
    traceId: row.traceId,
    reason: row.reason,
  }));
}

export async function insertTrace(trace: Trace) {
  const db = await getDb();
  await db.insert(t.traces).values({
    id: trace.id,
    workspaceId: trace.workspaceId,
    kind: trace.kind,
    question: trace.question,
    rewritten: trace.rewritten,
    stepsJson: JSON.stringify(trace.steps),
    citationCount: trace.citationCount,
    createdAt: trace.createdAt,
  });
}

export async function listTraces(workspaceId: string): Promise<Trace[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(t.traces)
    .where(eq(t.traces.workspaceId, workspaceId))
    .orderBy(desc(t.traces.createdAt));
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as Trace["kind"],
    question: row.question,
    rewritten: row.rewritten,
    steps: parseJson(row.stepsJson, []),
    citationCount: row.citationCount,
    createdAt: row.createdAt,
  }));
}

export async function getTrace(id: string): Promise<Trace | null> {
  const db = await getDb();
  const rows = await db.select().from(t.traces).where(eq(t.traces.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as Trace["kind"],
    question: row.question,
    rewritten: row.rewritten,
    steps: parseJson(row.stepsJson, []),
    citationCount: row.citationCount,
    createdAt: row.createdAt,
  };
}
