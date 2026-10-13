---
name: code-conventions
description: Universal code quality conventions — SOLID, Clean Code, Clean Architecture, DDD and TDD. Use when reviewing code design, structuring responsibilities, applying low-coupling/high-cohesion principles, or making architectural decisions in any language.
license: MIT
---

# Code quality conventions

Language-agnostic principles for code that is easy to **change without breaking** and **clear
enough that anyone — including future you — understands the *why* behind a decision**. Apply them
with judgement, not as dogma.

## SOLID

- **Single Responsibility** — one reason to change per module, class or function. Different
  responsibilities belong in different places.
- **Open/Closed** — extend behaviour without rewriting what exists. Reach for polymorphism,
  strategies or hooks instead of editing a growing conditional.
- **Liskov Substitution** — a subtype must replace its base type without breaking callers. If a
  subclass has to weaken a promise, the hierarchy is wrong.
- **Interface Segregation** — many small, focused interfaces beat one general one. No client
  should depend on methods it never calls.
- **Dependency Inversion** — high-level policy and low-level detail both depend on abstractions.
  Abstractions do not depend on details.

## Clean code

- **Names reveal intent.** `calculate_invoice_total()` and `active_users`, not `calc()` and
  `data`. Avoid abbreviations, obscure acronyms and placeholders like `tmp`, `info`, `res`.
- **Small functions, few parameters.** One job each, two or three parameters at most, early
  returns over deep nesting. A boolean flag that switches internal behaviour usually wants to be
  two functions.
- **No hidden side effects.** A function called `get_` must not write. Make every effect visible
  in the name or the signature.
- **Comment the *why*, not the *what*.** The code already says what it does. A `TODO` without an
  issue reference, date or owner is noise.
- **Never swallow errors.** A bare `catch`/`except` that drops the error is worse than no
  handling. Prefer explicit failure — exceptions, or a `Result`/`Either` return type — over
  ambiguous sentinel values.

## Clean Architecture

- **Dependencies point inward.** Domain logic must not import frameworks, databases, HTTP clients
  or UI. Those are details.
- **Separate the layers.** *Domain* holds business rules with no external dependencies. *Use
  cases* orchestrate rules toward one goal. *Adapters/infrastructure* implement databases, APIs
  and UI and are swappable.
- **Business rules testable without infrastructure.** If a use case can only be tested with a
  running database or network, coupling is too high.
- **Ports and adapters.** Declare the interface (port) the domain needs; implement it outside.
  The domain never names the adapter.

## DDD

- **Ubiquitous language.** Use the same vocabulary in code, conversation and documentation. A term
  in code must mean to the business exactly what it means to the team.
- **Entities vs value objects.** An entity has identity that persists over time; a value object is
  immutable and defined entirely by its attributes.
- **Aggregates.** A cluster of entities and value objects changed as one consistency unit, with a
  root that enforces the invariants.
- **Repositories.** Abstract storage and retrieval of aggregates. Put behaviour on entities and
  value objects; a domain service is only for operations that belong to neither.

## TDD

- **Red, green, refactor.** Write a failing test that states the behaviour, make it pass with the
  simplest change, then improve the design with the test as a safety net.
- **Test behaviour, not implementation.** Tests that break when you rename a private method are
  testing the wrong thing.
- **One reason to fail per test.** A test asserting six things gives you one signal and five
  distractions.

## Heuristics and pitfalls

- Prefer **composition over inheritance**; inherit only for genuine substitutability.
- Keep **I/O at the edges**; keep the core pure.
- **Duplication is cheaper than the wrong abstraction.** Do not extract a shared helper until the
  third repetition, and only when it shares a reason to change.
- **Do not apply a principle where it costs more than it returns.** A 50-line script does not need
  four layers. Match structure to the size and lifetime of the problem.
