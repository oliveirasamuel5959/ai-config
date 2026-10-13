---
name: testing-strategy
description: Decide what to test and at which level, and write tests that catch real defects. Use when adding tests, reviewing test coverage, choosing between unit and integration tests, or diagnosing a flaky or slow suite.
license: MIT
---

# Testing strategy

Test behaviour, not implementation. A suite earns its keep when it fails for real defects and
stays quiet otherwise.

## Choosing the level

| Level | Use for | Cost | Feedback |
| --- | --- | --- | --- |
| **Unit** | Pure logic, edge cases, parsing, validation | low | instant |
| **Integration** | A component with its real collaborators (DB, queue, filesystem) | medium | seconds |
| **Contract** | The interface between two services or a client/SDK pair | medium | seconds |
| **End-to-end** | One happy path per critical user journey | high | minutes |

The test pyramid is a budgeting rule, not a law. Push each check to the **lowest level that can
still catch the defect**. A validation rule belongs in a unit test; "the order endpoint actually
persists" belongs in an integration test.

## Writing a test that catches bugs

- **Name the behaviour, not the method.** `rejects_expired_token`, not `test_validate_2`.
- **One reason to fail.** A test asserting six things gives one signal and five distractions.
- **Arrange, act, assert** — visibly separated, even at the cost of a few lines.
- **Assert the specific outcome.** `assert result.status == "shipped"` beats `assert result`.
- **Test the boundary**, not the middle: empty, one, many, zero, negative, maximum, unicode,
  null, duplicate.
- **Deterministic by construction.** Fix the clock, seed the RNG, control the timezone. A test
  that passes on Tuesdays is not a test.

## What not to test

- Framework behaviour you did not write.
- Private method call sequences — that is a change-detector, not a test.
- Exact log strings or error prose, unless the user reads them.
- Tautologies: `assert add(2,2) == 2+2` proves nothing about the implementation.

## Fixtures and test data

- Build the smallest data that exercises the case. A 200-column fixture hides which column
  matters.
- Use **factories/builders with sensible defaults** so a test states only what it cares about.
- Never share mutable state between tests; create and tear down, or use a transaction rollback.
- Prefer a **real database in a container** over an in-memory stand-in — in-memory doubles and
  production engines disagree precisely where bugs live.

## Mocks

Mock at the **boundary you do not control** (a payment API, the clock, the network), not between
your own modules. Over-mocking produces tests that pass while the system is broken.

## Flaky and slow suites

1. **Reproduce** by running the single test in a loop (100x). A flake is a real defect — usually a
   shared fixture, an ordering dependency or an unawaited async call.
2. **Quarantine, then fix.** Do not retry-to-green; that hides the bug. Mark it, file it, fix it.
3. **Reclaim time.** Profile the slowest tests; move pure logic down to unit tests. The suite must
   stay fast enough that people actually run it.

## Coverage

Coverage finds **untested** code, not **correct** code. Use it as a map of where you have not
looked, never as a target to satisfy. Chasing a percentage produces assertion-free tests.
