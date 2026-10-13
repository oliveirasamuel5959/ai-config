---
name: refactoring
description: Change the structure of code without changing its behaviour, safely and in reviewable steps. Use when cleaning up duplication, untangling responsibilities, extracting abstractions, or preparing code for a new feature.
license: MIT
---

# Refactoring

Refactoring changes **structure, not behaviour**. If a test result changes, it was not a
refactoring.

## Preconditions

1. **Tests first.** If the code is untested, write characterization tests that capture what it does
   *today*, including its quirks. Then refactor against them.
2. **A clean tree.** Commit or stash unrelated work so the diff contains only the refactoring.
3. **One step at a time.** Transform, run the tests, commit. Do not stack five edits before
   finding out whether the first one was correct.

## The catalogue, in order of safety

**Naming and clarity**
- Rename for intent (`calc` → `calculate_invoice_total`). Follow it through every caller.
- Introduce a variable or a function to name a concept that is currently a comment.

**Extract and inline**
- **Extract function** when a block needs a comment to explain it.
- **Extract variable** when a condition is hard to read.
- **Inline** the function that is now a pointless indirection.

**Simplify conditionals**
- Replace nested `if/else` with **early returns** (guard clauses).
- Replace a boolean parameter that switches behaviour with **two named functions**.
- Replace a long `switch` on a type code with **polymorphism**, once the branches share a reason
  to change.

**Reorganize modules**
- **Move function** to the module that owns its data.
- **Extract class** when one class is doing two jobs.
- **Merge** classes that are always changed together.

**Remove**
- Delete dead code, commented-out blocks and unreachable branches. Version control remembers it.
- Delete speculative generality: the extension point nobody uses.

## The rules that keep it safe

- **Two hats.** Never refactor and change behaviour in the same commit. Do one, commit, then the
  other.
- **Small steps, always green.** If the suite is red mid-refactor, stop and fix before continuing.
- **Do not refactor code you cannot test**, unless you can genuinely characterize it first.
- **Do not fix a bug while refactoring.** Note it, finish the refactoring, then fix it as its own
  change with its own test.
- **Rule of three.** Extract a shared abstraction after the third duplication, not the first —
  and only when the copies share a reason to change. A wrong abstraction costs more than a
  duplicate.

## Recognizing a refactoring that has gone wrong

- The diff touches far more than the intended area.
- Behaviour changed, and you cannot say why.
- Tests had to be edited to keep passing.
- The new abstraction needs flags to cover the cases it was meant to unify.

Stop and revert to the last green commit rather than pushing through.

## Reporting

State what changed structurally, confirm **behaviour is unchanged**, and give the evidence: the
command run and its result, before and after.
