import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const traces = await repos.listTraces(id);
    return NextResponse.json({ traces });
  } catch (error) {
    return jsonError(error);
  }
}
