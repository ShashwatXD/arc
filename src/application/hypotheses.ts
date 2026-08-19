import type { Observation, ProbeSpec, Hypothesis } from "../domain/models.ts";
import { probeForHypothesis } from "../domain/hypotheses.ts";

export function applyObservation(hypotheses: Hypothesis[], observation: Observation): Hypothesis[] {
  const next = hypotheses.map((h) => ({ ...h }));
  const kind = observation.probe.kind;

  const set = (id: string, status: Hypothesis["status"]) => {
    const row = next.find((h) => h.id === id);
    if (row) row.status = status;
  };

  if (kind === "contract.cacheHit") {
    set("CacheHitAvoidsNetwork", observation.passed ? "confirmed" : "rejected");
  }
  if (kind === "discriminator.retryVsDuplicate") {
    set("RetryVsDuplicate", observation.passed ? "confirmed" : "rejected");
    if (observation.passed && !next.some((h) => h.id === "Idempotency")) {
      next.push({
        id: "Idempotency",
        claim: "Distinct query strings must not share a cache entry.",
        status: "open",
        openedBy: "discriminator.retryVsDuplicate",
      });
    }
  }
  if (kind === "discriminator.idempotency") {
    set("Idempotency", observation.passed ? "confirmed" : "rejected");
  }
  if (kind === "discriminator.concurrency") {
    set("NoInflightDuplicate", observation.passed ? "confirmed" : "rejected");
  }
  return next;
}

export function weaknessFor(observation: Observation): string | null {
  if (observation.passed) return null;
  if (observation.probe.kind === "discriminator.idempotency") return "cache key collision";
  if (observation.probe.kind === "discriminator.concurrency") return "concurrent requests duplicate work";
  if (observation.probe.kind === "discriminator.retryVsDuplicate") return "retry vs duplicate not distinguished";
  if (observation.probe.kind === "contract.cacheHit") return "cache miss on repeated GET";
  return `${observation.probe.kind} failed`;
}

export function heuristicNextProbe(input: {
  hypotheses: Hypothesis[];
  observations: Observation[];
  remainingBudget: number;
}): ProbeSpec | null {
  if (input.remainingBudget <= 0) return null;
  const ran = new Set(input.observations.map((o) => o.probe.kind));

  if (!ran.has("contract.basicGet")) {
    return { kind: "contract.basicGet", params: {} };
  }

  const open = input.hypotheses.filter((h) => h.status === "open");
  for (const h of open) {
    const kind = probeForHypothesis(h.id);
    if (kind && !ran.has(kind)) {
      return { kind, params: {} };
    }
  }
  return null;
}
