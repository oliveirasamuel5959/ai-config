---
name: verify
description: Require evidence before declaring work done. Use when finishing any code, data or configuration change, before reporting that a task is complete.
license: MIT
---

# Verify before you claim done

A task is not finished when the edits are written. It is finished when you have run the thing that
proves it works and shown the result. Never report success on the strength of the change "looking
right".

## Steps

1. **Find the check that matters.** Look for the project's own commands first, in this order:
   `AGENTS.md` / `CLAUDE.md`, `Makefile`, `package.json` scripts, `pyproject.toml`, `justfile`,
   CI workflow files. If none exist, infer the narrowest meaningful check for what you touched.
2. **Scope it.** Run the check for the area you changed, not the whole repo, unless the whole
   suite is fast. A focused test that runs in seconds beats a full suite you will not re-run.
3. **Read the actual output.** Do not skim for a green word. Confirm the assertion that covers
   your change ran, and was not skipped.
4. **On failure, fix the cause, not the symptom.** Re-run until it passes. Never delete, skip or
   loosen a test to get to green.
5. **If you cannot make it pass,** say so plainly, quote the failing output, and explain the
   blocker. An honest red is worth more than a false green.

## What to report

Close with the exact command you ran and a short summary of its result. For example:

- `pytest tests/test_clean.py -q` → 12 passed
- `npm test -- --run` → 48 passed, 0 failed
- `ruff check .` → All checks passed

## Pitfalls

- **A passing test that never exercises your change proves nothing.** Confirm coverage exists.
- **"It should work" is not evidence.** Run it.
- **Do not re-run a stale command.** If you edited after running, run again.
- **Data and notebooks count.** For analysis work, re-execute the notebook or script and show the
  regenerated output; a stale cell is an unverified claim.
- **Config and migrations count.** Validate the file parses and the migration applies, don't just
  eyeball the syntax.
