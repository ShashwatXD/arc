import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const { runId } = await params;
    const results = await repos.listEvalResults(runId);
    return NextResponse.json({ results });
  } catch (error) {
    return jsonError(error);
  }
}
