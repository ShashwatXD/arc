import "server-only";

import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { ConfigError } from "@/domain/errors";
import type { RetrievalPort, RetrievalSearchInput, RetrievedChunk } from "@/domain/ports";
import { env } from "@/lib/env";

const COLLECTION = "arc_chunks";
const DENSE = "dense";
const SPARSE = "bm25";

function client() {
  const { QDRANT_URL, QDRANT_API_KEY } = env();
  return new QdrantClient({
    url: QDRANT_URL,
    ...(QDRANT_API_KEY ? { apiKey: QDRANT_API_KEY } : {}),
    timeout: 30_000,
  });
}

function pointId(chunkId: string): string {
  const hex = createHash("sha1").update(`arc:${chunkId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function fnv1a(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toSparse(text: string): { indices: number[]; values: number[] } {
  const counts = new Map<number, number>();
  for (const token of tokenize(text)) {
    const index = fnv1a(token);
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  const indices = [...counts.keys()].sort((a, b) => a - b);
  return { indices, values: indices.map((index) => counts.get(index) ?? 0) };
}

async function ensureCollection(qdrant: QdrantClient, vectorSize: number) {
  const existing = await qdrant.getCollections();
  if (existing.collections.some((c) => c.name === COLLECTION)) return;
  await qdrant.createCollection(COLLECTION, {
    vectors: {
      [DENSE]: { size: vectorSize, distance: "Cosine" },
    },
    sparse_vectors: {
      [SPARSE]: { modifier: "idf" },
    },
  });
  await qdrant.createPayloadIndex(COLLECTION, {
    field_name: "workspaceId",
    field_schema: "keyword",
    wait: true,
  });
  await qdrant.createPayloadIndex(COLLECTION, {
    field_name: "sourceId",
    field_schema: "keyword",
    wait: true,
  });
}

function payloadOf(point: { payload?: Record<string, unknown> | null }): {
  chunkId: string;
  sourceId: string;
  workspaceId: string;
  sourceName: string;
  ordinal: number;
  text: string;
} | null {
  const payload = point.payload;
  if (!payload) return null;
  const chunkId = String(payload.chunkId ?? "");
  const text = String(payload.text ?? "");
  if (!chunkId || !text) return null;
  return {
    chunkId,
    sourceId: String(payload.sourceId ?? ""),
    workspaceId: String(payload.workspaceId ?? ""),
    sourceName: String(payload.sourceName ?? "source"),
    ordinal: Number(payload.ordinal ?? 0),
    text,
  };
}

export function createQdrantRetrieval(): RetrievalPort {
  return {
    async ping() {
      try {
        await client().getCollections();
        return true;
      } catch {
        return false;
      }
    },

    async upsert(chunks: RetrievedChunk[]) {
      if (chunks.length === 0) return;
      const missing = chunks.find((c) => !c.embedding?.length);
      if (missing) {
        throw new ConfigError(`Cannot index chunk ${missing.id} without an embedding.`);
      }
      const qdrant = client();
      await ensureCollection(qdrant, chunks[0].embedding!.length);
      await qdrant.upsert(COLLECTION, {
        wait: true,
        points: chunks.map((chunk) => ({
          id: pointId(chunk.id),
          vector: {
            [DENSE]: chunk.embedding!,
            [SPARSE]: toSparse(chunk.text),
          },
          payload: {
            chunkId: chunk.id,
            sourceId: chunk.sourceId,
            workspaceId: chunk.workspaceId,
            sourceName: chunk.sourceName,
            ordinal: chunk.ordinal,
            text: chunk.text,
          },
        })),
      });
    },

    async removeSource(sourceId: string) {
      const qdrant = client();
      const existing = await qdrant.getCollections();
      if (!existing.collections.some((c) => c.name === COLLECTION)) return;
      await qdrant.delete(COLLECTION, {
        wait: true,
        filter: { must: [{ key: "sourceId", match: { value: sourceId } }] },
      });
    },

    async removeWorkspace(workspaceId: string) {
      const qdrant = client();
      const existing = await qdrant.getCollections();
      if (!existing.collections.some((c) => c.name === COLLECTION)) return;
      await qdrant.delete(COLLECTION, {
        wait: true,
        filter: { must: [{ key: "workspaceId", match: { value: workspaceId } }] },
      });
    },

    async search(input: RetrievalSearchInput) {
      const qdrant = client();
      const existing = await qdrant.getCollections();
      if (!existing.collections.some((c) => c.name === COLLECTION)) return [];
      const workspaceFilter = {
        must: [{ key: "workspaceId", match: { value: input.workspaceId } }],
      };
      const sparse = toSparse(input.query);
      const result = await qdrant.query(COLLECTION, {
        filter: workspaceFilter,
        prefetch: [
          { query: input.queryVector, using: DENSE, limit: input.denseTopK },
          { query: sparse, using: SPARSE, limit: input.sparseTopK },
        ],
        query: { fusion: "rrf" },
        limit: input.fusedTopK,
        with_payload: true,
      });
      return result.points.flatMap((point) => {
        const payload = payloadOf(point);
        if (!payload) return [];
        const chunk: RetrievedChunk = {
          id: payload.chunkId,
          sourceId: payload.sourceId,
          workspaceId: payload.workspaceId,
          ordinal: payload.ordinal,
          text: payload.text,
          embedding: null,
          sourceName: payload.sourceName,
          score: point.score,
        };
        return [chunk];
      });
    },
  };
}
