# ai-config

Shared **skills**, **slash commands**, **subagents** and **plugins** for **Claude Code** and
**OpenCode**, organized by domain: **Software Development** and **Data Science**.

Install a profile globally or into a single project:

```bash
./sync.sh --profile all --global                    # ~/.claude + ~/.config/opencode
./sync.sh --profile data-science --project .        # ./.claude + ./.opencode
./sync.sh --profile core --dry-run --global         # preview, change nothing
```

Or, in Claude Code, install natively as a plugin:

```
/plugin marketplace add oliveirasamuel5959/ai-config
/plugin install software-dev@ai-config
```

## What's inside

| | Skills | Commands | Agents |
| --- | --- | --- | --- |
| **core** | `verify`, `code-conventions`, `git-commit-push`, `doc`, `spec-kit` | `/commit`, `/review`, `/test`, `/pr`, `/init-agents`, `/memory` | `explore`, `planner`, `reviewer`, `debugger`, `ask` |
| **software-dev** | `testing-strategy`, `api-design`, `refactoring`, `database-migrations`, `observability`, `ci-cd` | `/scaffold`, `/review-pr` | `architect`, `security-reviewer` |
| **data-science** | `exploratory-data-analysis`, `data-cleaning-pipeline`, `csv-data-wrangler`, `data-transform`, `scientific-visualization`, `sql-queries`, `scikit-learn-ml`, `jupyter-notebook`, `building-data-pipelines`, `data-analyst-reporting` | `/eda`, `/clean`, `/model`, `/notebook`, `/report` | `statistician`, `ml-engineer` |

Every domain profile includes `core`.

## Layout

```
core/                      domain-agnostic — a component root and a Claude plugin root
  mods/<name>/             Claude Code mods, each its own plugin root
domains/software-dev/      Software Development domain
domains/data-science/      Data Science domain
plugins/opencode/          OpenCode TypeScript plugins (memory)
profiles.conf              which component roots each profile installs
sync.sh                    the installer
```

Each component root holds `skills/<name>/SKILL.md`, `agents/*.md`, `commands/*.md`, and the
per-tool agent variants under `opencode/agents/`. See [AGENTS.md](AGENTS.md) for the authoring rules
that keep this DRY across two tools.

## Mods

Claude Code **mods** are plugins that change the interface itself — a live pane, a band above the
prompt. They live under `core/mods/`, one folder per mod, and each is a plugin root of its own.
`sync.sh` does not install them; they come from the marketplace:

```
/plugin install plan-progress@ai-config
```

| Mod | What it does |
| --- | --- |
| `plan-progress` | A pane and prompt band showing the running goal: its phase, the step checklist, a progress bar, elapsed time, and the skill and agent at work on the current step. `/plan-progress [all\|goal\|hide\|show\|clear]`. |

## `sync.sh`

```
./sync.sh [options]

  -p, --profile <name>    core | software-dev | data-science | all   (default: all)
  -t, --target <tool>     claude | opencode | both                  (default: both)
  -g, --global            install into $HOME (default)
  -d, --project <dir>     install into <dir>/.claude and <dir>/.opencode
  -L, --link              symlink skills instead of copying (live edits)
  -n, --dry-run           print the plan, change nothing
  -y, --yes               skip the confirmation prompt
      --no-instructions   skip AGENTS.md / CLAUDE.md wiring
  -f, --force             overwrite files this script does not manage
```

What it does:

- **Skills** are installed once into `~/.agents/skills/` (global) or `<project>/.claude/skills/`.
  Both tools read those paths, so there is no duplicate copy. Global installs add a symlink from
  `~/.claude/skills/<name>` so Claude Code finds them too.
- **Agents and commands** are copied per tool — their frontmatter differs, so they are not shared.
- **Instructions**: OpenCode gets `AGENTS.md`; `~/.claude/CLAUDE.md` gets one `@`-import line
  pointing at this repo's `AGENTS.md`, rather than a duplicated copy.
- **Safety**: every file it replaces is copied to `backup-<timestamp>/` first. Files changed outside
  this script are never overwritten unless `--force` is passed. Re-running is a no-op when nothing
  changed. A manifest at `~/.config/ai-config/manifest` records what was installed.

After installing agents, commands or plugins, **restart the tool** (skills and instructions reload
live). For OpenCode: `opencode service restart`.

## Two ways to install in Claude Code

- **`sync.sh`** copies files into `~/.claude` or a project's `.claude`, and names them plainly:
  `/commit`, `/review`, `explore`.
- **The plugin marketplace** installs from the repo and **namespaces** everything under the plugin:
  `/ai-config-core:commit`, `software-dev:architect`.

Both work; pick one per machine to avoid the same artifact loading twice.

## Attribution

Content is reimplemented from the sources credited in [ATTRIBUTION.md](ATTRIBUTION.md). Licensed
MIT — see [LICENSE](LICENSE).
