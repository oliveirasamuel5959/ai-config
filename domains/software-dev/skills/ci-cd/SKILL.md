---
name: ci-cd
description: Build pipelines that gate merges on real checks and deploy safely. Use when writing or reviewing CI workflow files, setting up deployment, adding gates, or deciding what a pipeline should run.
license: MIT
---

# CI/CD

A pipeline exists to make the **safe change easy** and the **unsafe change loud**. Optimize for
fast, trustworthy feedback — a pipeline people bypass is worse than none.

## What CI must do, in order

1. **Fail fast on the cheap checks first** — format, lint, type-check, secret scan. They take
   seconds and catch most mistakes.
2. **Build once**, then reuse that artifact for every later stage. Never rebuild per environment;
   the thing you tested must be the thing you ship.
3. **Test** — unit tests always; integration tests when the change touches a boundary.
4. **Security** — dependency audit and a secret/credential scan on every change and on a schedule,
   since new advisories appear without a commit.

Order stages by **cost and probability of failure**: the fastest, most likely to fail goes first
so the pipeline stops early.

## Caching and speed

- Cache dependencies and build output, keyed on the **lockfile hash** — not on a branch name.
- Parallelize independent jobs; a serial pipeline is a queue people wait in.
- **Target: feedback under 10 minutes for a PR.** Beyond that, contributors switch tasks and the
  pipeline loses its authority. Profile the slowest job before adding more of them.

## Gates

- **Require CI to pass before merge.** A failing check that can be merged is decoration.
- **Require a review**, and reset approvals when new commits land — approval of stale code is
  meaningless.
- **Protect the default branch**: no direct pushes, no force-push, no deletion.
- Keep the gate set **small and trusted**. Every flaky or ignored check erodes the whole gate.

## Secrets in CI

- Use the platform's **secret store**, never variables committed to the repo or echoed in logs.
- **Scope secrets to the jobs that need them**, and prefer short-lived OIDC tokens over long-lived
  static keys.
- Never expose secrets to workflows triggered by forks or untrusted PRs.
- Rotate on exposure, and assume anything printed to a log is disclosed.

## Deployment

- **Same artifact through every environment.** Configuration differs; the build must not.
- **Roll out progressively** — canary or percentage-based — and watch the golden signals before
  widening.
- **Automate rollback**, and rehearse it. A rollback path nobody has run is not a rollback path.
- **Separate deploy from release** where possible: ship dark behind a flag, then turn it on. This
  decouples "the code is in production" from "users are affected".
- **Migrations before the code that needs them**, and backward-compatible in between.

## Practising safety

- **On-call has a runbook** per alert, with the exact commands to diagnose and to roll back.
- **Blameless postmortems** for every incident: timeline, contributing causes, and concrete
  actions with owners — not "be more careful".
- **Encode each incident as a check.** A bug that reached production should leave behind a test or
  a gate that would have caught it.

## Pipeline file checklist

- [ ] Triggers explicit: which branches, which paths, which events.
- [ ] Concurrency control so superseded runs are cancelled, not queued.
- [ ] Pinned action/image versions (a tag, ideally a digest) — never a floating `latest`.
- [ ] Timeouts set on every job, so a hang does not burn hours.
- [ ] Least-privilege permissions declared for the workflow token.
- [ ] The artifact built once and promoted, not rebuilt.
