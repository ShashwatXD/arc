import { NextResponse } from "next/server";
import { ArcError } from "@/domain/errors";

export function jsonError(error: unknown) {
  if (error instanceof ArcError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(error);
  return NextResponse.json({ error: message, code: "internal" }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}
