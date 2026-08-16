import "server-only";

import { newId } from "@/domain";
import type { TraceStep } from "@/domain/models";
import * as repos from "@/adapters/db/repos";

export async function persistTrace(input: {
  workspaceId: string;
  kind: "chat" | "eval";
  question: string;
  rewritten: string | null;
  steps: TraceStep[];
  citationCount: number;
}) {
  const trace = {
    id: newId("trace"),
    workspaceId: input.workspaceId,
    kind: input.kind,
    question: input.question,
    rewritten: input.rewritten,
    steps: input.steps,
    citationCount: input.citationCount,
    createdAt: Date.now(),
  };
  await repos.insertTrace(trace);
  return trace;
}
