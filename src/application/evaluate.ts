import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { inspectRepo } from "../adapters/inspect-repo.ts";
import { inspectApi } from "../adapters/inspect-api.ts";
import { runProbe } from "../adapters/run-probe.ts";
import { createPlanner } from "../adapters/planner.ts";
import { compileProbe } from "../probes/compile.ts";
import { parseProbeSpec } from "../domain/parse-probe.ts";
import { hypothesesFromInspect } from "../domain/hypotheses.ts";
import { applyObservation, weaknessFor } from "./hypotheses.ts";
import { checkInvariant, score } from "./score.ts";
import type {
  CapabilityCall,
  CapabilityName,
  Observation,
  TaskContract,
  TraceV1,
} from "../domain/models.ts";

const TASKS: Record<string, TaskContract> = {
  "implement caching": {
    id: "caching",
    title: "Implement caching",
    description: "GET responses must be cached. Retries must not double-apply. Query strings must be part of the cache key. In-flight duplicate GETs must coalesce.",
    invariants: [
      "repeated GET uses cache",
      "fail-then-ok is one logical write",
      "query string is in the cache key",
      "in-flight GETs coalesce",
    ],
  },
};

export function resolveTask(task: string): TaskContract {
  const key = task.trim().toLowerCase();
  const found = TASKS[key];
  if (found) return found;
  return {
    id: "custom",
    title: task,
    description: task,
    invariants: ["behavior matches the stated task"],
  };
}

export async function evaluate(input: {
  targetPath: string;
  task: string;
  budget?: number;
}): Promise<TraceV1> {
  const task = resolveTask(input.task);
  const maxProbes = input.budget ?? 8;
  const log: CapabilityCall[] = [];
  const call = (name: CapabilityName, payload: unknown) => {
    log.push({ name, input: payload, at: Date.now() });
  };

  call("inspectRepo", { targetPath: input.targetPath });
  const repo = inspectRepo(input.targetPath);
  call("inspectApi", { targetPath: input.targetPath });
  const api = inspectApi(input.targetPath);

  let hypotheses = hypothesesFromInspect(repo);
  const observations: Observation[] = [];
  const planner = createPlanner();
  const docker = process.env.ARC_SANDBOX === "docker";
  const targetImport = docker
    ? "/target/src/client.mjs"
    : pathToFileURL(join(input.targetPath, "src/client.mjs")).href;

  for (let i = 0; i < maxProbes; i++) {
    const spec = await planner.nextProbe({
      task,
      repo,
      api,
      hypotheses,
      observations,
      remainingBudget: maxProbes - i,
    });
    if (!spec) break;

    parseProbeSpec(spec);
    const compiled = compileProbe(spec, targetImport);
    call("mockNetwork", { kind: spec.kind });
    call("runProbe", spec);
    const result = await runProbe({
      targetPath: input.targetPath,
      spec: compiled.spec,
      source: compiled.source,
    });

    const observation: Observation = {
      probe: compiled.spec,
      passed: result.passed,
      detail: result.passed ? "pass" : result.stderr || result.stdout.slice(-500),
      metrics: {},
      weakness: null,
    };
    observation.weakness = weaknessFor(observation);
    call("checkInvariant", checkInvariant(spec.kind, result.passed, observation.detail));
    observations.push(observation);
    hypotheses = applyObservation(hypotheses, observation);
  }

  const scorecard = score({
    task,
    observations,
    hypotheses,
    probesRun: observations.map((o) => o.probe),
  });
  call("score", { score: scorecard.score });
  call("traceExecution", { version: 1, probes: observations.length });

  return {
    version: 1,
    task,
    inspection: { repo, api },
    hypotheses,
    observations,
    capabilityLog: log,
    scorecard,
  };
}

export function formatScorecard(trace: TraceV1): string {
  const s = trace.scorecard;
  const lines = [
    `Task: ${s.task}`,
    "",
    `Generated:  ${s.probesRun.map((p) => p.kind).join(", ") || "(none)"}`,
    `Result:     ${s.contract.passed + s.discriminator.passed}/${s.contract.total + s.discriminator.total} probes passed`,
    `Contract:   ${s.contract.passed}/${s.contract.total} ${s.contract.items.join("; ")}`,
    `Discriminator: ${s.discriminator.passed}/${s.discriminator.total} ${s.discriminator.items.join("; ")}`,
    `Discovered: ${s.weaknesses.length ? s.weaknesses.join("; ") : "(none)"}`,
    `Untested:   ${s.residual.length ? s.residual.join("; ") : "(none)"}`,
    `Score:      ${s.score}/100`,
  ];
  return lines.join("\n");
}
