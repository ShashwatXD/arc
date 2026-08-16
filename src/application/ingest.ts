import "server-only";

import { ArcError, newId, nodeByKind, parseNodeConfig } from "@/domain";
import type { Chunk, Source, SourceKind } from "@/domain/models";
import { createOpenAiEmbedder } from "@/adapters/openai";
import * as repos from "@/adapters/db/repos";
import { getServices } from "@/lib/composition";

export async function ingestText(input: {
  workspaceId: string;
  name: string;
  kind: SourceKind;
  text: string;
  byteSize?: number;
  sourceId?: string;
}) {
  const workspace = await repos.getWorkspace(input.workspaceId);
  if (!workspace) throw new ArcError("Workspace not found.", "not_found", 404);
  const now = Date.now();
  const existing = input.sourceId ? await repos.getSource(input.sourceId) : null;
  if (input.sourceId && !existing) throw new ArcError("Source not found.", "not_found", 404);

  const source: Source = existing
    ? {
        ...existing,
        name: input.name,
        kind: input.kind,
        rawText: input.text,
        byteSize: input.byteSize ?? input.text.length,
        status: "indexing",
        error: null,
        updatedAt: now,
      }
    : {
        id: newId("source"),
        workspaceId: input.workspaceId,
        kind: input.kind,
        name: input.name,
        status: "indexing",
        byteSize: input.byteSize ?? input.text.length,
        rawText: input.text,
        error: null,
        createdAt: now,
        updatedAt: now,
      };

  if (existing) await repos.updateSource(source.id, source);
  else await repos.insertSource(source);

  try {
    await indexSource(source);
    return (await repos.getSource(source.id))!;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Indexing failed.";
    await repos.updateSource(source.id, { status: "error", error: message, updatedAt: Date.now() });
    throw error;
  }
}

export async function indexSource(source: Source) {
  const workspace = await repos.getWorkspace(source.workspaceId);
  if (!workspace?.activeWorkflowId) throw new ArcError("No active workflow.", "no_workflow");
  const workflow = await repos.getWorkflow(workspace.activeWorkflowId);
  if (!workflow) throw new ArcError("Active workflow missing.", "no_workflow");

  const chunkNode = nodeByKind(workflow.graph, "chunk");
  const embedNode = nodeByKind(workflow.graph, "embed");
  const chunkCfg = parseNodeConfig("chunk", chunkNode?.config ?? {});
  const embedCfg = parseNodeConfig("embed", embedNode?.config ?? {});
  const { chunker, embedder, retrieval } = getServices();
  const namedEmbedder = embedder.model === embedCfg.model ? embedder : createOpenAiEmbedder(embedCfg.model);

  const pieces = await chunker.split(source.rawText, chunkCfg.size, chunkCfg.overlap);
  if (pieces.length === 0) throw new ArcError("No text to index in this source.", "empty_source");

  await retrieval.removeSource(source.id);
  const embeddings = await namedEmbedder.embed(pieces);
  if (embeddings.length !== pieces.length || embeddings.some((vector) => !vector?.length)) {
    throw new ArcError("Embedding provider returned an empty vector.", "embed_failed", 502);
  }
  const chunks: Chunk[] = pieces.map((text, ordinal) => ({
    id: newId("chunk"),
    sourceId: source.id,
    workspaceId: source.workspaceId,
    ordinal,
    text,
    embedding: null,
  }));
  await repos.replaceChunks(source.id, chunks);
  await retrieval.upsert(
    chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index] ?? null,
      sourceName: source.name,
      score: 0,
    })),
  );
  await repos.updateSource(source.id, { status: "ready", error: null, updatedAt: Date.now() });
  await repos.updateWorkspace(source.workspaceId, { updatedAt: Date.now() });
}

export async function reindexWorkspace(workspaceId: string) {
  const sources = await repos.listSources(workspaceId);
  const errors: string[] = [];
  for (const source of sources) {
    await repos.updateSource(source.id, { status: "indexing", error: null, updatedAt: Date.now() });
    try {
      await indexSource({ ...source, status: "indexing" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Indexing failed.";
      errors.push(`${source.name}: ${message}`);
      await repos.updateSource(source.id, { status: "error", error: message, updatedAt: Date.now() });
    }
  }
  if (errors.length === sources.length && sources.length > 0) {
    throw new ArcError(errors.join("; "), "reindex_failed", 502);
  }
}
