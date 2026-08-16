import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  try {
    const { id, sourceId } = await params;
    const source = await repos.getSource(sourceId);
    if (!source || source.workspaceId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const chunks = await repos.listChunksForSource(sourceId);
    return NextResponse.json({
      source,
      chunks: chunks.map((c) => ({ id: c.id, ordinal: c.ordinal, text: c.text })),
    });
  } catch (error) {
    return jsonError(error);
  }
}
