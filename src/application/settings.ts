import "server-only";

import { z } from "zod";
import { ArcError } from "@/domain/errors";
import * as repos from "@/adapters/db/repos";
import { resetServices } from "@/lib/composition";
import {
  env,
  readStoredSettings,
  writeStoredSettings,
  type StoredSettings,
} from "@/lib/env";

const patchSchema = z.object({
  openaiApiKey: z.string().optional(),
  clearOpenaiApiKey: z.boolean().optional(),
  openaiBaseUrl: z.string().optional(),
  openaiModel: z.string().optional(),
  embeddingApiKey: z.string().optional(),
  clearEmbeddingApiKey: z.boolean().optional(),
  embeddingSameAsChat: z.boolean().optional(),
  embeddingBaseUrl: z.string().optional(),
  embeddingModel: z.string().optional(),
  qdrantUrl: z.string().optional(),
  qdrantApiKey: z.string().optional(),
  clearQdrantApiKey: z.boolean().optional(),
  applyModelsToWorkflows: z.boolean().optional(),
});

export type SettingsPatch = z.infer<typeof patchSchema>;

function last4(value: string | undefined) {
  if (!value) return null;
  return value.length <= 4 ? value : value.slice(-4);
}

function setOrKeep(
  current: string | undefined,
  next: string | undefined,
  clear: boolean | undefined,
) {
  if (clear) return undefined;
  if (next === undefined) return current;
  const trimmed = next.trim();
  return trimmed.length === 0 ? current : trimmed;
}

function setText(current: string | undefined, next: string | undefined) {
  if (next === undefined) return current;
  const trimmed = next.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function publicSettings() {
  const stored = readStoredSettings();
  const resolved = env();
  return {
    openaiKeySet: Boolean(resolved.OPENAI_API_KEY),
    openaiKeyLast4: last4(resolved.OPENAI_API_KEY),
    openaiKeyFromFile: Boolean(stored.OPENAI_API_KEY),
    openaiBaseUrl: resolved.OPENAI_BASE_URL ?? "",
    openaiModel: resolved.OPENAI_MODEL,
    embeddingKeySet: Boolean(resolved.EMBEDDING_API_KEY || resolved.OPENAI_API_KEY),
    embeddingKeyLast4: last4(resolved.EMBEDDING_API_KEY || resolved.OPENAI_API_KEY),
    embeddingSameAsChat: !stored.EMBEDDING_API_KEY && !stored.EMBEDDING_BASE_URL,
    embeddingBaseUrl: resolved.EMBEDDING_BASE_URL ?? resolved.OPENAI_BASE_URL ?? "",
    embeddingModel: resolved.EMBEDDING_MODEL,
    qdrantUrl: resolved.QDRANT_URL,
    qdrantKeySet: Boolean(resolved.QDRANT_API_KEY),
  };
}

export async function saveSettings(input: unknown) {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    throw new ArcError(parsed.error.issues[0]?.message ?? "Invalid settings.", "invalid_settings");
  }
  const patch = parsed.data;
  const current = readStoredSettings();
  const next: StoredSettings = { ...current };

  next.OPENAI_API_KEY = setOrKeep(current.OPENAI_API_KEY, patch.openaiApiKey, patch.clearOpenaiApiKey);
  next.OPENAI_BASE_URL = setText(current.OPENAI_BASE_URL, patch.openaiBaseUrl);
  next.OPENAI_MODEL = setText(current.OPENAI_MODEL, patch.openaiModel) ?? current.OPENAI_MODEL;

  if (patch.embeddingSameAsChat) {
    next.EMBEDDING_API_KEY = undefined;
    next.EMBEDDING_BASE_URL = undefined;
  } else {
    next.EMBEDDING_API_KEY = setOrKeep(
      current.EMBEDDING_API_KEY,
      patch.embeddingApiKey,
      patch.clearEmbeddingApiKey,
    );
    next.EMBEDDING_BASE_URL = setText(current.EMBEDDING_BASE_URL, patch.embeddingBaseUrl);
  }
  next.EMBEDDING_MODEL = setText(current.EMBEDDING_MODEL, patch.embeddingModel) ?? current.EMBEDDING_MODEL;

  next.QDRANT_URL = setText(current.QDRANT_URL, patch.qdrantUrl);
  next.QDRANT_API_KEY = setOrKeep(current.QDRANT_API_KEY, patch.qdrantApiKey, patch.clearQdrantApiKey);

  writeStoredSettings(next);
  resetServices();

  const resolved = env();
  if (patch.applyModelsToWorkflows !== false) {
    await applyModelsToWorkflows(resolved.OPENAI_MODEL, resolved.EMBEDDING_MODEL);
  }

  return publicSettings();
}

async function applyModelsToWorkflows(chatModel: string, embeddingModel: string) {
  const workflows = await repos.listAllWorkflows();
  for (const workflow of workflows) {
    const graph = {
      ...workflow.graph,
      nodes: workflow.graph.nodes.map((node) => {
        if (node.kind === "generate") {
          return { ...node, config: { ...node.config, model: chatModel } };
        }
        if (node.kind === "embed") {
          return { ...node, config: { ...node.config, model: embeddingModel } };
        }
        return node;
      }),
    };
    await repos.saveWorkflowGraph(workflow.id, graph);
  }
}
