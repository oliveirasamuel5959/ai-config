---
description: Review a pull request end to end — diff, tests, description and CI — and report findings.
argument-hint: "[PR number or URL — defaults to the PR for the current branch]"
---

Review pull request: **$ARGUMENTS** (if empty, use the PR for the current branch via `gh pr view`).

Steps:

1. **Gather context.** `gh pr view` for the description and linked issue, `gh pr diff` for the
   change, and `gh pr checks` for CI status.
2. **Understand the intent** before judging the code. Read the linked issue or the description.
   A change that does what was asked is not a defect because it differs from what you expected.
3. **Review the diff in context** — open the changed files, not just the hunks. Trace changed code
   to its callers.
4. **Check the tests**: do they prove the behaviour changed? Is the bug fix accompanied by a test
   that fails without it?
5. **Check the PR itself**: is CI green, is the description accurate, is the change one logical
   unit, does it need a migration or a follow-up?
6. **Report** by severity with `file:line`, using the `reviewer` criteria. Post as a review
   comment if asked (`gh pr review`), otherwise report back.

Do not approve or request changes on the user's behalf without asking. Do not push commits to
someone else's branch.
