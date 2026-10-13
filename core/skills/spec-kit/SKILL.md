---
name: spec-kit
description: Specification-driven development — write the spec before the code, then implement against it. Use when starting a feature, when requirements are vague, or when a change needs an agreed definition of done before implementation.
license: MIT
---

# Spec-driven development

The specification is the source of truth. **Decide the what and the why before the how**, then
implement against the written spec — so "done" is a defined state rather than an opinion.

## When to use it

- A feature spanning more than a couple of files, or more than one person.
- Requirements that are vague ("make search better") and need pinning down.
- Anything with a real cost of being wrong: a data contract, a public API, a migration.

**Skip it** for a one-line fix or an experiment you will throw away. A spec for a typo is overhead.

## The artifacts, in order

### 1. Constitution — once per project

The standing rules that outrank any single feature: quality bar, testing expectations, what is out
of bounds. Short — a page. Examples:

- "Every change ships with a test that fails without it."
- "No new runtime dependency without a written justification."
- "The public API is additive-only within a major version."

Keep it in the repository, referenced from `AGENTS.md`, so both humans and agents apply it.

### 2. Specification — the *what* and *why*

No implementation detail. Answer:

- **Who** has the problem, and in what situation?
- **What** must be true when this is done — as observable outcomes, not as code.
- **What is out of scope** — the boundary matters as much as the content.
- **How we will know it works** — acceptance criteria, each testable.

Write acceptance criteria as **given / when / then**, one behaviour each. "Search is faster" is not
a criterion; "a query over 1M rows returns in under 200 ms at p95" is.

### 3. Plan — the *how*

Only after the spec is agreed:

- The approach, and the alternatives that were rejected and why.
- The files and components affected.
- The data model or interface changes, if any.
- Risks, and what is hard to reverse.

### 4. Tasks — the executable breakdown

Small, ordered, each independently verifiable. Each names the file(s) it touches and the check that
proves it is done. A task that cannot be verified is not a task — it is a wish.

## The discipline that makes it work

- **No implementation before the spec is agreed.** The whole value is in deciding before building.
- **Change the spec first.** When reality demands a different behaviour, update the spec, then the
  code — never the reverse. A code change that contradicts the spec leaves the spec lying.
- **One spec per feature.** Superseded specs are marked, not silently edited into something else.
- **Keep it short.** A spec nobody reads is worse than no spec. Two pages that are read beat twenty
  that are not.
- **Acceptance criteria are the definition of done.** When they all pass, the feature is done —
  regardless of how much code you expected to write.

## Where the artifacts live

```
.specify/
  memory/constitution.md     project-wide rules
  specs/<feature>/
    spec.md                  what and why, with acceptance criteria
    plan.md                  how, with rejected alternatives
    tasks.md                 ordered, verifiable steps
```

Commit them with the code they describe. The spec is part of the deliverable, not scaffolding.

## Anti-patterns

- **Spec as fiction** — written once, ignored, and diverging from the code from the first commit.
- **Spec as design doc** — full of implementation detail, so it is stale the moment code changes.
- **Untestable criteria** — "should be fast", "should be intuitive". Unfalsifiable criteria are not
  criteria.
- **Spec after the fact** — writing it once the code is done to satisfy a process. It documents
  nothing and constrains nothing.
