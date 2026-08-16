import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { jsonError } from "@/lib/http";
import { getServices } from "@/lib/composition";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const { id, sourceId } = await params;
    const source = await repos.getSource(sourceId);
    if (!source || source.workspaceId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await getServices().retrieval.removeSource(sourceId);
    await repos.deleteSource(sourceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
