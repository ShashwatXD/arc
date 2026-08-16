import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  activeWorkflowId: text("active_workflow_id"),
  isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
});

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  byteSize: integer("byte_size").notNull().default(0),
  rawText: text("raw_text").notNull().default(""),
  error: text("error"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chunks = sqliteTable("chunks", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  ordinal: integer("ordinal").notNull(),
  text: text("text").notNull(),
  embeddingJson: text("embedding_json"),
});

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  graphJson: text("graph_json").notNull(),
  createdAt: integer("created_at").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  title: text("title").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  citationsJson: text("citations_json").notNull().default("[]"),
  traceId: text("trace_id"),
  createdAt: integer("created_at").notNull(),
});

export const evalDatasets = sqliteTable("eval_datasets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const evalItems = sqliteTable("eval_items", {
  id: text("id").primaryKey(),
  datasetId: text("dataset_id").notNull(),
  question: text("question").notNull(),
  expectedAnswer: text("expected_answer").notNull(),
});

export const evalRuns = sqliteTable("eval_runs", {
  id: text("id").primaryKey(),
  datasetId: text("dataset_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  workflowName: text("workflow_name").notNull(),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  metricsJson: text("metrics_json"),
  error: text("error"),
});

export const evalResults = sqliteTable("eval_results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  itemId: text("item_id").notNull(),
  question: text("question").notNull(),
  expectedAnswer: text("expected_answer").notNull(),
  answer: text("answer").notNull(),
  scoresJson: text("scores_json").notNull(),
  passed: integer("passed", { mode: "boolean" }).notNull(),
  citationsJson: text("citations_json").notNull().default("[]"),
  traceId: text("trace_id").notNull(),
  reason: text("reason").notNull().default(""),
});

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  kind: text("kind").notNull(),
  question: text("question").notNull(),
  rewritten: text("rewritten"),
  stepsJson: text("steps_json").notNull(),
  citationCount: integer("citation_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
