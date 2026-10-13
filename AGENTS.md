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
  agents/opencode/*.md   OpenCode agents (separate frontmatter)
  commands/*.md          shared commands
  commands/opencode/*.md OpenCode command variants
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
   variant under `commands/opencode/` instead.
3. **Agents are always per-tool, and the body is duplicated on purpose.** Agent frontmatter is
   genuinely incompatible:
   - Claude Code: `name`, `description`, optional `tools`, `color` (camelCase). **Never** set
     `model` — agents inherit the session model so the repo stays portable.
   - OpenCode: `description`, `mode: primary|subagent`, optional ordered `permissions` array.
     No `name` (the filename is the name).

   Both files carry the identical body text. `agents/opencode/` exists only for OpenCode and is
   never installed into `~/.claude/agents/`.

## Why `core/` and each domain are Claude plugin roots

Verified against Claude Code 2.1.296: a marketplace entry with `source: "./"` loads **only**
`skills` — its `agents` and `commands` arrays are silently ignored, and symlinked agents are not
followed either. Real plugin directories, by contrast, load `skills/`, `agents/` and `commands/`
correctly. So each component root carries a real `.claude-plugin/plugin.json`, and the marketplace
`source` points at that directory. No build step, no generated `dist/`.

`agents/opencode/` sits *inside* the plugin root but is not a name Claude Code scans for, so the
per-tool variants stay invisible to Claude while `sync.sh` reads them for OpenCode.

## Conventions

- Artifact content is written in **English** and attributed in `ATTRIBUTION.md`.
- Content is **reimplemented**, not copied verbatim, from the referenced sources. The
  `marcos2872/agents-config` repo carries **no license**, so treat it as inspiration only.
- Keep a skill's `name` equal to its directory name.
- Prefer skills over commands for new work: Claude Code has folded commands into skills.

## Verification

- `./sync.sh --dry-run --profile all --global` — inspect the install plan before touching anything.
- `./sync.sh --profile data-science --project /tmp/scratch --yes` then inspect the produced
  `.claude/` and `.opencode/` trees.
- `opencode debug agents` and `opencode debug config` — confirm agents and config sources.
- `claude plugin validate .` — confirm the marketplace and each plugin manifest.
