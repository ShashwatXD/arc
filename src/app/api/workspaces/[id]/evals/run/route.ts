import { NextResponse } from "next/server";
import { runEvalSuite } from "@/application/run-evals";
import { jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson<{ datasetId: string; workflowId?: string }>(request);
    const result = await runEvalSuite({
      workspaceId: id,
      datasetId: body.datasetId,
      workflowId: body.workflowId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
