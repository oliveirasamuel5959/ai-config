# Attribution

This repository **reimplements concepts and topic coverage** from the sources below in original
text. No third-party file is copied verbatim.

## marcos2872/agents-config — concepts only, unlicensed

<https://github.com/marcos2872/agents-config>

The artifact taxonomy for the OpenCode side — flat agents with `mode`/`permissions` frontmatter,
filename-named commands, `skills/<name>/SKILL.md`, a project-memory plugin exposing
`memory_write`/`memory_list`/`memory_delete`, and a `sync.sh` that copies into
`~/.config/opencode` with timestamped backups — informed this repo's structure.

**This repository has no LICENSE file**, so all rights are reserved by its author. It is used as
inspiration for structure and topic coverage only. Nothing from it is reproduced verbatim.

## Claude Code for Data Scientists — skill topics

<https://www.aibuilderclub.com/blog/claude-code-for-data-scientists-skills-guide>

The Data Science skill inventory (exploratory data analysis, cleaning pipelines, wrangling,
transformation, scientific visualization, SQL, classical ML, notebooks, pipelines, reporting)
follows the stages and topic list in this guide.

## anthropics/skills — reference, not vendored

<https://github.com/anthropics/skills>

The marketplace layout used here (root `.claude-plugin/marketplace.json`, per-plugin
component directories, `strict`/path semantics) follows the pattern demonstrated by this
repository. Its skills are **not** vendored into this repo; the document skills (xlsx, docx,
pptx, pdf) and example skills are consumed as Anthropic's own plugin marketplace.
