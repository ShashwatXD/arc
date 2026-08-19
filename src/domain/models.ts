export const CAPABILITIES = [
  "inspectRepo",
  "inspectApi",
  "mockNetwork",
  "runProbe",
  "traceExecution",
  "checkInvariant",
  "score",
] as const;

export type CapabilityName = (typeof CAPABILITIES)[number];

export const probeKinds = [
  "contract.basicGet",
  "contract.cacheHit",
  "discriminator.retryVsDuplicate",
  "discriminator.idempotency",
  "discriminator.concurrency",
] as const;

export type ProbeKind = (typeof probeKinds)[number];

export function isProbeKind(value: string): value is ProbeKind {
  return (probeKinds as readonly string[]).includes(value);
}

export type ProbeFamily = "contract" | "discriminator";

export function probeFamily(kind: ProbeKind): ProbeFamily {
  return kind.startsWith("contract.") ? "contract" : "discriminator";
}

export type ProbeSpec = {
  kind: ProbeKind;
  params: Record<string, string | number | boolean>;
};

export type TaskContract = {
  id: string;
  title: string;
  description: string;
  invariants: string[];
};

export type HypothesisStatus = "open" | "confirmed" | "rejected";

export type Hypothesis = {
  id: string;
  claim: string;
  status: HypothesisStatus;
  openedBy: string;
};

export type RepoInspection = {
  files: string[];
  hasCache: boolean;
  hasFetchWrapper: boolean;
  hasRetry: boolean;
  hasLock: boolean;
};

export type ApiInspection = {
  specPath: string | null;
  paths: string[];
};

export type Observation = {
  probe: ProbeSpec;
  passed: boolean;
  detail: string;
  metrics: Record<string, number>;
  weakness: string | null;
};

export type CapabilityCall = {
  name: CapabilityName;
  input: unknown;
  at: number;
};

export type EpisodeBudget = {
  maxProbes: number;
};

export type ScoreSlice = {
  passed: number;
  total: number;
  items: string[];
};

export type Scorecard = {
  task: string;
  contract: ScoreSlice;
  discriminator: ScoreSlice;
  residual: string[];
  weaknesses: string[];
  score: number;
  probesRun: ProbeSpec[];
};

export type TraceV1 = {
  version: 1;
  task: TaskContract;
  inspection: { repo: RepoInspection; api: ApiInspection };
  hypotheses: Hypothesis[];
  observations: Observation[];
  capabilityLog: CapabilityCall[];
  scorecard: Scorecard;
};
