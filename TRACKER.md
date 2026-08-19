# Tracker

Walk order. `- [ ]` open. `- [x]` done. Do not start H2 until H1 is crossed.

## H1 kernel

- [x] CLI package `arc` (this repo)
- [x] Domain: TaskContract, ProbeSpec, Hypothesis, Observation, EpisodeBudget
- [x] Seven capability ports
- [x] Local sandbox (node:test). Docker adapter behind `ARC_SANDBOX=docker`
- [x] Node adapter: ProbeSpec compiles to node:test source
- [x] Planner picks next ProbeSpec from the catalog only
- [x] Fixture `targets/cache`
- [x] `arc evaluate targets/cache --task "implement caching"` prints scorecard

## H2 adaptive

- [x] Hypothesis store (open / confirmed / rejected)
- [x] Discriminator RetryVsDuplicate (fail then ok)
- [x] Idempotency follow-up after retry confirms
- [x] Stop when hypotheses are quiet or budget is exhausted
- [x] Scorecard: contract coverage, discriminator probes, untested residual

## M1

- [ ] Python adapter for the same ProbeSpec
- [x] OpenAPI inspect when a spec file exists
- [x] Concurrency probe (in-flight duplicate work)
- [x] Versioned trace JSON on the episode
- [ ] CLI cost/time budget flags (probe budget is `--budget`)

## M2

- [ ] Mutation / adversarial probe kinds
- [ ] Weakness search beyond the catalog
- [ ] Optional UI
- [ ] Compare two agents
