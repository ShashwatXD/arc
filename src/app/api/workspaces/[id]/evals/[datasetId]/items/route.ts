import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { newId } from "@/domain/ids";
import { jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; datasetId: string }> },
) {
  try {
    const { id, datasetId } = await params;
    const body = await readJson<{ items: { question: string; expectedAnswer: string }[] }>(request);
    const items = (body.items ?? [])
      .filter((i) => i.question.trim())
      .map((i) => ({
        id: newId("evalItem"),
        datasetId,
        question: i.question.trim(),
        expectedAnswer: i.expectedAnswer.trim(),
      }));
    const datasets = await repos.listDatasets(id);
    if (!datasets.some((d) => d.id === datasetId)) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }
    await repos.replaceEvalItems(datasetId, items);
    return NextResponse.json({ items });
  } catch (error) {
    return jsonError(error);
  }
}
