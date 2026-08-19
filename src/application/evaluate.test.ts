import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "./evaluate.ts";
import { CAPABILITIES } from "../domain/models.ts";

test("evaluate cache target: search, weaknesses, seven capabilities, catalog only", async () => {
  process.env.ARC_PLANNER = "heuristic";
  const target = join(dirname(fileURLToPath(import.meta.url)), "../../targets/cache");
  const trace = await evaluate({
    targetPath: target,
    task: "implement caching",
    budget: 8,
  });

  const kinds = trace.observations.map((o) => o.probe.kind);
  assert.ok(kinds.includes("contract.basicGet"));
  assert.ok(kinds.includes("contract.cacheHit"));
  assert.ok(kinds.includes("discriminator.retryVsDuplicate"));
  assert.ok(kinds.includes("discriminator.idempotency"), "idempotency must be spawned after retry");
  assert.ok(kinds.includes("discriminator.concurrency"));

  const retryIdx = kinds.indexOf("discriminator.retryVsDuplicate");
  const idemIdx = kinds.indexOf("discriminator.idempotency");
  assert.ok(retryIdx >= 0 && idemIdx > retryIdx);

  const idem = trace.observations.find((o) => o.probe.kind === "discriminator.idempotency");
  assert.equal(idem?.passed, false);
  assert.equal(idem?.weakness, "cache key collision");

  const conc = trace.observations.find((o) => o.probe.kind === "discriminator.concurrency");
  assert.equal(conc?.passed, false);
  assert.ok(trace.scorecard.weaknesses.includes("cache key collision"));
  assert.ok(trace.scorecard.weaknesses.includes("concurrent requests duplicate work"));

  assert.equal(trace.scorecard.contract.total >= 2, true);
  assert.equal(trace.scorecard.discriminator.total >= 2, true);
  assert.equal(trace.version, 1);
  assert.ok(trace.inspection.api.specPath);

  const names = new Set(trace.capabilityLog.map((c) => c.name));
  for (const cap of CAPABILITIES) {
    assert.ok(names.has(cap), `missing capability ${cap}`);
  }
});
