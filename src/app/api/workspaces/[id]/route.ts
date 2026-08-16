import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { jsonError, readJson } from "@/lib/http";
import { getServices } from "@/lib/composition";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workspace = await repos.getWorkspace(id);
    if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const sources = await repos.listSources(id);
    const workflows = await repos.listWorkflows(id);
    const datasets = await repos.listDatasets(id);
    return NextResponse.json({ workspace, sources, workflows, datasets });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson<{ name?: string; description?: string }>(request);
    await repos.updateWorkspace(id, { ...body, updatedAt: Date.now() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await getServices().retrieval.removeWorkspace(id);
    await repos.deleteWorkspace(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
