import { probeFamily, type Hypothesis, type Observation, type ProbeSpec, type Scorecard, type TaskContract } from "../domain/models.ts";

export function checkInvariant(name: string, held: boolean, detail: string) {
  return { name, held, detail };
}

export function score(input: {
  task: TaskContract;
  observations: Observation[];
  hypotheses: Hypothesis[];
  probesRun: ProbeSpec[];
}): Scorecard {
  const contractObs = input.observations.filter((o) => probeFamily(o.probe.kind) === "contract");
  const discObs = input.observations.filter((o) => probeFamily(o.probe.kind) === "discriminator");

  const slice = (obs: Observation[]) => ({
    passed: obs.filter((o) => o.passed).length,
    total: obs.length,
    items: obs.map((o) => `${o.probe.kind}${o.passed ? "" : " FAIL"}`),
  });

  const contract = slice(contractObs);
  const discriminator = slice(discObs);
  const contractRate = contract.total === 0 ? 1 : contract.passed / contract.total;
  const discRate = discriminator.total === 0 ? 1 : discriminator.passed / discriminator.total;
  const residual = input.hypotheses.filter((h) => h.status === "open").map((h) => `${h.id}: ${h.claim}`);
  const weaknesses = input.observations.map((o) => o.weakness).filter((w): w is string => Boolean(w));

  return {
    task: input.task.title,
    contract,
    discriminator,
    residual,
    weaknesses,
    score: Math.round(50 * contractRate + 50 * discRate),
    probesRun: input.probesRun,
  };
}
