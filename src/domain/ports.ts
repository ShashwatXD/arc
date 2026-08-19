import type {
  ApiInspection,
  ProbeSpec,
  RepoInspection,
  Scorecard,
  TaskContract,
  TraceV1,
} from "./models.ts";

export class ArcError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ArcError";
  }
}

export type InspectRepoPort = {
  inspectRepo(targetPath: string): Promise<RepoInspection>;
};

export type InspectApiPort = {
  inspectApi(targetPath: string): Promise<ApiInspection>;
};

export type MockNetworkPort = {
  mockNetwork(sequence: string[]): { calls: () => number; fetch: (url: string) => Promise<{ ok: boolean; status: number; body: string }> };
};

export type RunProbePort = {
  runProbe(input: {
    targetPath: string;
    spec: ProbeSpec;
    source: string;
  }): Promise<{ passed: boolean; stdout: string; stderr: string }>;
};

export type TraceExecutionPort = {
  traceExecution(trace: TraceV1): void;
};

export type CheckInvariantPort = {
  checkInvariant(name: string, held: boolean, detail: string): { name: string; held: boolean; detail: string };
};

export type ScorePort = {
  score(input: {
    task: TaskContract;
    observations: TraceV1["observations"];
    hypotheses: TraceV1["hypotheses"];
    probesRun: ProbeSpec[];
  }): Scorecard;
};

export type PlannerPort = {
  nextProbe(input: {
    task: TaskContract;
    repo: RepoInspection;
    api: ApiInspection;
    hypotheses: TraceV1["hypotheses"];
    observations: TraceV1["observations"];
    remainingBudget: number;
  }): Promise<ProbeSpec | null>;
};

export type Capabilities = InspectRepoPort &
  InspectApiPort &
  MockNetworkPort &
  RunProbePort &
  TraceExecutionPort &
  CheckInvariantPort &
  ScorePort;
