import assert from "node:assert/strict";
import test from "node:test";
import { applyObservation } from "./hypotheses.ts";
import type { Hypothesis, Observation } from "../domain/models.ts";

test("retry confirmation opens Idempotency; that probe did not exist before", () => {
  const start: Hypothesis[] = [
    {
      id: "RetryVsDuplicate",
      claim: "retry",
      status: "open",
      openedBy: "inspectRepo",
    },
  ];
  assert.equal(start.some((h) => h.id === "Idempotency"), false);

  const obs: Observation = {
    probe: { kind: "discriminator.retryVsDuplicate", params: {} },
    passed: true,
    detail: "pass",
    metrics: {},
    weakness: null,
  };
  const next = applyObservation(start, obs);
  const idem = next.find((h) => h.id === "Idempotency");
  assert.ok(idem);
  assert.equal(idem.status, "open");
  assert.equal(idem.openedBy, "discriminator.retryVsDuplicate");
});
