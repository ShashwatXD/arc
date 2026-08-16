import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const conversations = await repos.listConversations(id);
    return NextResponse.json({ conversations });
  } catch (error) {
    return jsonError(error);
  }
}
