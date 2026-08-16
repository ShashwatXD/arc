import { NextResponse } from "next/server";
import { reindexWorkspace } from "@/application/ingest";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await reindexWorkspace(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
