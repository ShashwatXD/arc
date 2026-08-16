import { NextResponse } from "next/server";
import { publicSettings, saveSettings } from "@/application/settings";
import { jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(publicSettings());
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJson<unknown>(request);
    const settings = await saveSettings(body);
    return NextResponse.json(settings);
  } catch (error) {
    return jsonError(error);
  }
}
