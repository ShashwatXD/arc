import { NextResponse } from "next/server";
import * as repos from "@/adapters/db/repos";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const messages = await repos.listMessages(conversationId);
    return NextResponse.json({ messages });
  } catch (error) {
    return jsonError(error);
  }
}
