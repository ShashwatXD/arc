import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApiInspection } from "../domain/models.ts";

const CANDIDATES = ["openapi.json", "openapi.yaml", "openapi.yml", "swagger.json"];

export function inspectApi(targetPath: string): ApiInspection {
  for (const name of CANDIDATES) {
    const specPath = join(targetPath, name);
    if (!existsSync(specPath)) continue;
    const raw = readFileSync(specPath, "utf8");
    const paths: string[] = [];
    try {
      const json = JSON.parse(raw) as { paths?: Record<string, unknown> };
      if (json.paths) paths.push(...Object.keys(json.paths));
    } catch {
      for (const match of raw.matchAll(/^\s+(\/[^\s:]+):/gm)) {
        if (match[1]) paths.push(match[1]);
      }
    }
    return { specPath, paths };
  }
  return { specPath: null, paths: [] };
}
