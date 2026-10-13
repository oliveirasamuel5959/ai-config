---
description: Review the current changes (or a given target) for correctness, regressions and missing tests.
argument-hint: "[branch, PR number or path — defaults to the working tree]"
---

Review this target, read-only. Do not edit anything.

- **Target:** $ARGUMENTS — if empty, review the working tree (`git diff HEAD`).

Method:

1. Get the diff and read each changed file **in context**, not just the changed hunks.
2. Trace changed code to its callers and effects.
3. Report findings grouped **Critical / High / Medium / Low**. Each finding: `file:line`, what is
   wrong, the concrete failure scenario, and a suggested fix.
4. List the tests that are missing for the change.
5. If there are no findings, say so plainly.

Prioritise correctness, regressions, security and error handling over style.
