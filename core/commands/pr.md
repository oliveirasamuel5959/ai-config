---
description: Open a GitHub pull request with a structured description built from the branch diff.
argument-hint: "[base branch — defaults to the repository default]"
---

Open a pull request for the current branch using the GitHub CLI.

- **Base branch:** $ARGUMENTS — if empty, use the repository default (`gh repo view --json
  defaultBranchRef`).

Steps:

1. Confirm the branch is pushed (`git status -sb`); push it if not.
2. Read what will be reviewed: `git log --oneline <base>..HEAD` and `git diff <base>...HEAD`.
3. Compose the PR:
   - **Title** — Conventional Commits style, matching the dominant change.
   - **Summary** — what changes and why, two or three sentences.
   - **Changes** — a bullet list of the substantive edits.
   - **How to test** — the exact commands a reviewer should run.
4. Create it:

   ```bash
   gh pr create --base <base> --title "<title>" --body-file <file>
   ```

5. Report the PR URL.

Confirm the base branch, and any reviewers or labels, before creating the PR. Never force-push.
