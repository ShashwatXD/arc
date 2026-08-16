import "server-only";

import * as cheerio from "cheerio";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { ArcError } from "@/domain/errors";
import type { SourceKind } from "@/domain/models";

export async function extractFromFile(file: File): Promise<{ kind: SourceKind; name: string; text: string }> {
  const name = file.name || "upload";
  const lower = name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (lower.endsWith(".pdf")) {
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n\n") : String(result.text ?? "");
    return { kind: "pdf", name, text: text.trim() };
  }
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return { kind: "docx", name, text: value.trim() };
  }
  if (lower.endsWith(".md")) {
    return { kind: "md", name, text: buffer.toString("utf8").trim() };
  }
  if (lower.endsWith(".txt") || lower.endsWith(".text")) {
    return { kind: "txt", name, text: buffer.toString("utf8").trim() };
  }
  throw new ArcError(`Unsupported file type: ${name}. Use PDF, DOCX, MD, or TXT.`, "unsupported_type");
}

export async function extractFromUrl(url: string): Promise<{ name: string; text: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ArcError("That URL is not valid.", "bad_url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new ArcError("Only http(s) URLs can be ingested.", "bad_url");
  }
  const response = await fetch(parsed.toString(), {
    headers: { "user-agent": "ArcStudio/1.0 (knowledge ingest)" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new ArcError(`Could not fetch URL (${response.status}).`, "fetch_failed", 502);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer, noscript").remove();
  const title = $("title").first().text().trim() || parsed.hostname;
  const text = $("body").text().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!text) throw new ArcError("No readable text on that page.", "empty_source");
  return { name: title.slice(0, 120), text };
}
