---
name: git-commit-push
description: Analyze the working tree, group changes into Conventional Commits, and commit, push or open a pull request. Use when the user asks to commit, push, save changes, write a commit message, or create a PR.
argument-hint: "[optional: commit type, scope, target branch, or --pr]"
license: MIT
---

# Git commit, push and pull request

Read the real diff, group it into logical commits, and write messages that follow
[Conventional Commits v1.0.0](https://www.conventionalcommits.org/).

## Message format

```
<type>(<optional scope>): <imperative summary>

<optional body: why, not what>

<optional footer: BREAKING CHANGE, Refs #123>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`revert`.

**Rules:** summary in the imperative mood, lower case, no trailing period, 72 characters or
fewer. The body explains *why* the change was made. Mark a breaking change with `!` after the
type/scope (`feat(api)!:`) and a `BREAKING CHANGE:` footer.

## Workflow

1. **Inspect.** Run `git status`, then `git diff` for unstaged and `git diff --cached` for staged
   work. Read `git log --oneline -20` to match the repository's existing style.
2. **Group.** Split the changes into commits that each represent one logical unit. A refactor and
   a behaviour change belong in separate commits even when they touch the same file. Do not
   bundle unrelated formatting churn into a feature commit.
3. **Stage selectively.** Add specific paths — `git add <path>` — rather than `git add -A`, so
   nothing unintended rides along. Use `git add -p` when one file mixes concerns.
4. **Commit** each group with its own message.
5. **Push** only when asked, to the current branch, and never with `--force` on a shared branch.
6. **Pull request**, when asked, via the GitHub CLI:

   ```bash
   gh pr create --base <base> --title "<conventional title>" --body-file <file>
   ```

   The body covers **Summary**, **Changes** and **How to test**. Confirm the base branch and any
   reviewers with the user before creating it.

## Guardrails

- **Never commit secrets.** Check the diff for `.env` files, credentials, tokens and private
  keys. If one appears, stop and tell the user rather than committing it.
- **Never `git push --force`** to a shared branch, and never rewrite pushed history without an
  explicit request.
- **Never commit files the user did not intend**, such as build output or editor state. Check
  `.gitignore` first.
- **Do not push or open a PR unasked.** Committing is local; publishing is outward-facing.
- **Do not invent a scope.** Omit it when the change is not confined to one area.
