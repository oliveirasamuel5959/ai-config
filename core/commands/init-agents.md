---
description: Create or refresh this project's AGENTS.md from the repository's real state.
---

Analyze this repository and write or update `AGENTS.md` at its root.

Gather, from the repository itself — never from assumption:

- **Commands** — install, build, test, lint, format, run. Confirm each one exists in `package.json`
  scripts, `Makefile`, `pyproject.toml`, `justfile`, `Taskfile` or CI config before writing it
  down.
- **Architecture** — the top-level layout, the entry points, how data flows between the main
  modules, and any external services.
- **Conventions** — naming, error handling, testing layout, commit style. Infer from the existing
  code, not from generic best practice.

Rules:

- Maximum ~200 lines. Dense and specific beats long.
- Delete stale sections, and do not keep a command you did not verify.
- If a fact cannot be established from the repository, omit it rather than guessing.
- Do not invent a section for tooling the project does not use.

$ARGUMENTS
