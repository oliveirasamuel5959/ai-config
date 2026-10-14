# ai-config — repository guide

A single source of truth for **skills**, **slash commands**, **subagents** and **plugins** used
with **Claude Code** and **OpenCode**, across two domains: **Software Development** and
**Data Science**. `sync.sh` installs a profile globally (`~`) or into one project.

## Layout

```
core/                    domain-agnostic artifacts (both domains get these)
  .claude-plugin/        plugin.json — core/ is itself a Claude plugin root
  skills/<name>/SKILL.md
  agents/*.md            Claude Code agents (flat, no subdirectories)
  commands/*.md          shared commands
  opencode/agents/*.md   OpenCode agents (flat, per-tool frontmatter)
  opencode/commands/*.md OpenCode command variants (none exist today)
  mods/<name>/           Claude Code mods, each its own plugin root
domains/
  software-dev/          same structure as core/
  data-science/          same structure as core/
plugins/opencode/        OpenCode TypeScript plugins
profiles.conf            profile -> component directories
sync.sh                  installer
```

## The three rules that keep this repo DRY

1. **Skills are single-source.** One `SKILL.md` serves both tools. Write bodies tool-neutral —
   never name a specific tool's tool (`edit_file`, `write_file`, `Read`); say "edit the file".
   Frontmatter is limited to keys both tools accept: `name`, `description`, optional
   `argument-hint`, `license`.
2. **Commands are shared unless frontmatter diverges.** `commands/*.md` is emitted to both
   tools. When Claude Code's `` !`cmd` `` inlining or OpenCode's `$ARGUMENTS` is needed, add a
   variant under `opencode/commands/` instead — `sync.sh` prefers it over the shared file by name.
   No command needs one today; every one carries only `description` and `argument-hint`.
3. **Agents are always per-tool, and the body is duplicated on purpose.** Agent frontmatter is
   genuinely incompatible:
   - Claude Code: `name`, `description`, optional `tools`, `color` (camelCase). **Never** set
     `model` — agents inherit the session model so the repo stays portable.
   - OpenCode: `description`, `mode: primary|subagent`, optional ordered `permissions` array.
     No `name` (the filename is the name).

   Both files carry the identical body text. `opencode/agents/` exists only for OpenCode and is
   never installed into `~/.claude/agents/`.

## Mods

A **mod** changes Claude's own interface — a pane, a band above the prompt, a slash command of its
own. Mods are **Claude Code only**: they are TypeScript modules registered against the `claude-code`
API, so there is no OpenCode counterpart to keep in step, and `sync.sh` does not install them.
Each lives at `core/mods/<name>/` as a plugin root of its own, wired into the marketplace as a
fourth plugin entry — that is how it reaches another machine:

```
/plugin install plan-progress@ai-config
```

Authoring rules:

- `.claude-plugin/plugin.json` names the mod, its version and its `types` contract.
- `hooks/hooks.json` lists the module; `hooks/register.tsx` holds `export const register: Register`.
  `hooks/progress.ts` is the other half — the pure part, turning observations into a phase, a
  checklist and a bar, with no `$` in sight. `hooks/metrics.ts` is a second pure module holding the
  accounting: what a turn cost, where the time went, what went wrong. `hooks/register.test.ts` covers
  register with a mocked engine; `hooks/progress.test.ts` and `hooks/metrics.test.ts` cover the pure
  two directly.
- Every value the mod keeps in `$.state` is declared in `types/index.d.ts`, which the module imports
  its value types from. Keep it hand-written; it is the contract, not a build artifact.
- `.claude-plugin/types/` is a *different* directory and is **engine-written** — the API
  declarations for the installed Claude Code version, regenerated on load and never committed
  (the top-level `.gitignore` does not cover it, so watch `git status` before staging).
- The mod's top-level `tsconfig.json` does travel: it extends that generated config for `tsc -p`.

Verify a mod with `claude plugin validate core/mods/<name>` and `claude plugin test core/mods/<name>`.

## Why `core/` and each domain are Claude plugin roots

Verified against Claude Code 2.1.296: a marketplace entry with `source: "./"` loads **only**
`skills` — its `agents` and `commands` arrays are silently ignored, and symlinked agents are not
followed either. Real plugin directories, by contrast, load `skills/`, `agents/` and `commands/`
correctly. So each component root carries a real `.claude-plugin/plugin.json`, and the marketplace
`source` points at that directory. No build step, no generated `dist/`.

`opencode/agents/` sits *inside* the plugin root but is not a name Claude Code scans for, so the
per-tool variants stay invisible to Claude while `sync.sh` reads them for OpenCode.

## Conventions

- Artifact content is written in **English** and attributed in `ATTRIBUTION.md`.
- Content is **reimplemented**, not copied verbatim, from the referenced sources. The
  `marcos2872/agents-config` repo carries **no license**, so treat it as inspiration only.
- Keep a skill's `name` equal to its directory name.
- Prefer skills over commands for new work: Claude Code has folded commands into skills.
- Commits are **Conventional Commits**, scoped to what moved: `core`, `software-dev`,
  `data-science`, or no scope for a repo-wide change.

## Verification

- `./sync.sh -h` — every option; README.md documents the same list in prose.
- `./sync.sh --dry-run --profile all --global` — inspect the install plan before touching anything.
- `./sync.sh --profile data-science --project /tmp/scratch --yes` then inspect the produced
  `.claude/` and `.opencode/` trees.
- `opencode debug agents` and `opencode debug config` — confirm agents and config sources.
- `claude plugin validate .` — confirm the marketplace and each plugin manifest.
- `claude plugin test core/mods/<name>` — run a mod's suite.

There is no `package.json`, linter, formatter or CI here; the mod is the only executable code.
