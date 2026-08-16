import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { newId } from "@/domain/ids";
import { jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const datasets = await repos.listDatasets(id);
    const withItems = await Promise.all(
      datasets.map(async (d) => ({ ...d, items: await repos.listEvalItems(d.id) })),
    );
    const runs = await repos.listEvalRuns(id);
    return NextResponse.json({ datasets: withItems, runs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson<{ name?: string }>(request);
    const dataset = {
      id: newId("dataset"),
      workspaceId: id,
      name: body.name?.trim() || "Golden set",
      createdAt: Date.now(),
    };
    await repos.insertDataset(dataset);
    return NextResponse.json({ dataset }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
