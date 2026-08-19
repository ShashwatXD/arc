#!/usr/bin/env node
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { evaluate, formatScorecard } from "../application/evaluate.ts";
import { ArcError } from "../domain/ports.ts";

async function main() {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      task: { type: "string" },
      budget: { type: "string" },
    },
  });

  const [cmd, target] = positionals;
  if (cmd !== "evaluate" || !target) {
    console.error('Usage: arc evaluate <path> --task "implement caching" [--budget 8]');
    process.exit(1);
  }
  if (!values.task) {
    console.error("Missing --task. The task contract is the oracle.");
    process.exit(1);
  }

  const trace = await evaluate({
    targetPath: resolve(target),
    task: values.task,
    budget: values.budget ? Number(values.budget) : undefined,
  });
  console.log(formatScorecard(trace));
}

main().catch((err) => {
  const message = err instanceof ArcError ? err.message : err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
