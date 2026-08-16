import "server-only";

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "arc.db");

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

const migrateSql = `
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  active_workflow_id TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  raw_text TEXT NOT NULL DEFAULT '',
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  text TEXT NOT NULL,
  embedding_json TEXT
);
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  graph_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations_json TEXT NOT NULL DEFAULT '[]',
  trace_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS eval_datasets (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS eval_items (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  question TEXT NOT NULL,
  expected_answer TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  metrics_json TEXT,
  error TEXT
);
CREATE TABLE IF NOT EXISTS eval_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  question TEXT NOT NULL,
  expected_answer TEXT NOT NULL,
  answer TEXT NOT NULL,
  scores_json TEXT NOT NULL,
  passed INTEGER NOT NULL,
  citations_json TEXT NOT NULL DEFAULT '[]',
  trace_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  question TEXT NOT NULL,
  rewritten TEXT,
  steps_json TEXT NOT NULL,
  citation_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_ws ON sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chunks_ws ON chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chunks_src ON chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_wf_ws ON workflows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conv_ws ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_msg_cv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ds_ws ON eval_datasets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ei_ds ON eval_items(dataset_id);
CREATE INDEX IF NOT EXISTS idx_er_ws ON eval_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_rs_run ON eval_results(run_id);
CREATE INDEX IF NOT EXISTS idx_tr_ws ON traces(workspace_id);
`;

let rawClient: ReturnType<typeof createClient> | null = null;
let dbSingleton: ReturnType<typeof drizzle<typeof schema>> | null = null;
let migrated = false;

export async function getDb() {
  ensureDir();
  if (!rawClient) {
    rawClient = createClient({ url: `file:${dbPath}` });
  }
  if (!migrated) {
    await rawClient.executeMultiple(migrateSql);
    migrated = true;
  }
  if (!dbSingleton) {
    dbSingleton = drizzle(rawClient, { schema });
  }
  return dbSingleton;
}
