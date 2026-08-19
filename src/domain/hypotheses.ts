import type { Hypothesis, ProbeKind, RepoInspection } from "./models.ts";

export function hypothesesFromInspect(repo: RepoInspection): Hypothesis[] {
  const out: Hypothesis[] = [];
  if (repo.hasCache && repo.hasFetchWrapper) {
    out.push({
      id: "CacheHitAvoidsNetwork",
      claim: "A second identical GET must not hit the network.",
      status: "open",
      openedBy: "inspectRepo",
    });
    out.push({
      id: "NoInflightDuplicate",
      claim: "Concurrent identical GETs must share one in-flight request.",
      status: "open",
      openedBy: "inspectRepo",
    });
  }
  if (repo.hasRetry) {
    out.push({
      id: "RetryVsDuplicate",
      claim: "A fail-then-ok sequence is a retry, not a duplicate side effect.",
      status: "open",
      openedBy: "inspectRepo",
    });
  }
  return out;
}

export function probeForHypothesis(id: string): ProbeKind | null {
  switch (id) {
    case "CacheHitAvoidsNetwork":
      return "contract.cacheHit";
    case "RetryVsDuplicate":
      return "discriminator.retryVsDuplicate";
    case "Idempotency":
      return "discriminator.idempotency";
    case "NoInflightDuplicate":
      return "discriminator.concurrency";
    default:
      return null;
  }
}

export const DEFAULT_URL = "http://api.local/item";
export const DEFAULT_BODY = "ok-body";
