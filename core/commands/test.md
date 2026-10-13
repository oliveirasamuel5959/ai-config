---
description: Run the relevant test suite for the changed area, fix failures, and show the evidence.
argument-hint: "[path, test name or suite, optional]"
---

Follow the `verify` skill.

1. Find the project's test command: check `AGENTS.md` / `CLAUDE.md`, `Makefile`, `package.json`
   scripts, `pyproject.toml`, `justfile`, then CI config.
2. Scope the run to the area that changed. **Target:** $ARGUMENTS (whole suite if empty).
3. Read the output — confirm the assertions that cover the change actually ran.
4. On failure, fix the root cause and re-run until it passes. Do not skip, delete or loosen a
   test, and do not widen a timeout to hide a hang.
5. If it cannot be fixed, report the blocker with the failing output.
6. Close with the exact command and its result.
