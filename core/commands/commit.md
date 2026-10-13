---
description: Analyze the working tree and commit it as one or more Conventional Commits.
argument-hint: "[scope or commit type, optional]"
---

Follow the `git-commit-push` skill.

1. Read the state: `git status`, `git diff`, `git diff --cached`, and recent history with
   `git log --oneline -20`.
2. Split the changes into logical commits — one unit of work each, Conventional Commits format,
   imperative summary, 72 characters or fewer.
3. Stage selectively by path; never `git add -A` blindly, and never stage a file that looks like a
   secret.
4. Commit each group.
5. Report the commit hashes and messages. **Do not push** unless explicitly asked.

$ARGUMENTS
