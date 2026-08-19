import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { RepoInspection } from "../domain/models.ts";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

export function inspectRepo(targetPath: string): RepoInspection {
  const files = walk(targetPath)
    .filter((f) => [".ts", ".js", ".mjs"].includes(extname(f)))
    .map((f) => relative(targetPath, f));

  let hasCache = false;
  let hasFetchWrapper = false;
  let hasRetry = false;
  let hasLock = false;

  for (const rel of files) {
    const source = readFileSync(join(targetPath, rel), "utf8");
    const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      const text = node.getText(sf);
      if (ts.isIdentifier(node) && (node.text === "Map" || node.text === "cache")) hasCache = true;
      if (/new Map/.test(text)) hasCache = true;
      if (ts.isIdentifier(node) && (node.text === "fetch" || node.text === "fetchImpl")) hasFetchWrapper = true;
      if (ts.isIdentifier(node) && (node.text === "retry" || node.text === "retries")) hasRetry = true;
      if (/for\s*\(.*retries/.test(source) || /retry/i.test(source)) hasRetry = true;
      if (ts.isIdentifier(node) && (node.text === "lock" || node.text === "mutex" || node.text === "inflight")) {
        hasLock = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    if (/\bfetch\b/.test(source) || /fetchImpl/.test(source)) hasFetchWrapper = true;
    if (/cache/i.test(source)) hasCache = true;
  }

  return { files, hasCache, hasFetchWrapper, hasRetry, hasLock };
}
