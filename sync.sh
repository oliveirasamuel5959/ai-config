#!/usr/bin/env bash
#
# sync.sh — install ai-config skills, agents and commands into Claude Code and/or OpenCode,
# either globally (in $HOME) or into a specific project.
#
# Usage:
#   ./sync.sh [options]
#
# Options:
#   -p, --profile <name>    core | software-dev | data-science | all   (default: all)
#   -t, --target <tool>     claude | opencode | both                  (default: both)
#   -g, --global            install into $HOME (default)
#   -d, --project <dir>     install into <dir>/.claude and <dir>/.opencode
#   -L, --link              symlink skills instead of copying (live edits)
#   -n, --dry-run           print the plan, change nothing
#   -y, --yes               do not prompt for confirmation
#       --no-instructions   skip AGENTS.md / CLAUDE.md wiring
#   -f, --force             overwrite files this script does not manage
#   -h, --help              this help
#
# Files are considered managed if a previous run recorded them in the manifest. Anything else
# that already exists is left alone unless --force is passed. Replaced files are copied to
# <root>/backup-<timestamp>/ first; unchanged files are skipped, so re-runs are quiet.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILES_FILE="$ROOT/profiles.conf"

PROFILE="all"
TARGET="both"
SCOPE="global"
PROJECT_DIR=""
LINK=0
DRY_RUN=0
ASSUME_YES=0
DO_INSTRUCTIONS=1
FORCE=0

usage() { sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--profile)   PROFILE="${2:?missing profile}"; shift 2 ;;
    -t|--target)    TARGET="${2:?missing target}"; shift 2 ;;
    -g|--global)    SCOPE="global"; shift ;;
    -d|--project)   SCOPE="project"; PROJECT_DIR="${2:?missing dir}"; shift 2 ;;
    -L|--link)      LINK=1; shift ;;
    -n|--dry-run)   DRY_RUN=1; shift ;;
    -y|--yes)       ASSUME_YES=1; shift ;;
    --no-instructions) DO_INSTRUCTIONS=0; shift ;;
    -f|--force)     FORCE=1; shift ;;
    -h|--help)      usage 0 ;;
    *) echo "unknown option: $1" >&2; usage 1 ;;
  esac
done

case "$TARGET" in claude|opencode|both) ;; *) echo "invalid --target: $TARGET" >&2; exit 1 ;; esac
if [ "$SCOPE" = "project" ]; then
  [ -n "$PROJECT_DIR" ] || { echo "error: --project needs a directory" >&2; exit 1; }
  PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd)" || { echo "error: no such dir: $PROJECT_DIR" >&2; exit 1; }
fi

# ── profile resolution ─────────────────────────────────────────────────────────

[ -f "$PROFILES_FILE" ] || { echo "error: $PROFILES_FILE not found" >&2; exit 1; }

COMPONENTS=()
in_profile=0
while IFS= read -r line; do
  line="${line%%#*}"; line="$(echo "$line" | xargs || true)"
  [ -z "$line" ] && continue
  if [[ "$line" == \[*\] ]]; then
    [[ "${line:1:${#line}-2}" == "$PROFILE" ]] && in_profile=1 || in_profile=0
    continue
  fi
  [ "$in_profile" = 1 ] && COMPONENTS+=("$line")
done < "$PROFILES_FILE"

[ ${#COMPONENTS[@]} -gt 0 ] || { echo "error: profile '$PROFILE' is empty or unknown" >&2; exit 1; }
for c in "${COMPONENTS[@]}"; do
  [ -d "$ROOT/$c" ] || { echo "error: component '$c' not found under $ROOT" >&2; exit 1; }
done

# ── destination roots ──────────────────────────────────────────────────────────

# Skills are shared between the tools: OpenCode reads ~/.agents/skills natively, and Claude Code
# reads ~/.claude/skills through a symlink into it. In a project, .claude/skills is read by both.
# Agents and commands are NOT shared — each tool gets its own copy.
if [ "$SCOPE" = "global" ]; then
  SHARED_SKILLS="$HOME/.agents/skills"
  SKILLS_BACKUP_ROOT="$HOME/.agents"
  CLAUDE_ROOT="$HOME/.claude"
  OPENCODE_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
  MANIFEST="${XDG_CONFIG_HOME:-$HOME/.config}/ai-config/manifest"
else
  SHARED_SKILLS="$PROJECT_DIR/.claude/skills"
  SKILLS_BACKUP_ROOT="$PROJECT_DIR/.claude"
  CLAUDE_ROOT="$PROJECT_DIR/.claude"
  OPENCODE_ROOT="$PROJECT_DIR/.opencode"
  MANIFEST="$PROJECT_DIR/.claude/.ai-config-manifest"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
PLAN=()
MANAGED=()   # absolute paths installed by this run
CHANGED=0    # set by the install_* helpers

note() { PLAN+=("$1"); }
want() { [ "$TARGET" = "both" ] || [ "$TARGET" = "$1" ]; }

is_managed() {
  [ -f "$MANIFEST" ] || return 1
  grep -qxF "$1" "$MANIFEST"
}

# ── planning ───────────────────────────────────────────────────────────────────

opencode_command_names() {  # $1 = component dir; shared commands, opencode/ overriding by name
  { ls "$1"/commands/*.md 2>/dev/null || true; ls "$1"/opencode/commands/*.md 2>/dev/null || true; } \
    | xargs -r -n1 basename | sort -u
}

for c in "${COMPONENTS[@]}"; do
  src="$ROOT/$c"

  for sk in "$src"/skills/*/; do
    [ -d "$sk" ] || continue
    name="$(basename "$sk")"
    [ -f "$sk/SKILL.md" ] || { echo "warning: $sk has no SKILL.md, skipped" >&2; continue; }
    note "skill  $name -> $SHARED_SKILLS/$name"
  done

  if want claude; then
    for f in "$src"/agents/*.md;   do [ -e "$f" ] || continue; note "agent  $(basename "$f") -> $CLAUDE_ROOT/agents/"; done
    for f in "$src"/commands/*.md; do [ -e "$f" ] || continue; note "cmd    $(basename "$f") -> $CLAUDE_ROOT/commands/"; done
  fi

  if want opencode; then
    for f in "$src"/opencode/agents/*.md; do [ -e "$f" ] || continue; note "agent  $(basename "$f") -> $OPENCODE_ROOT/agents/  [opencode]"; done
    while IFS= read -r name; do
      [ -n "$name" ] || continue
      if [ -f "$src/opencode/commands/$name" ]; then
        note "cmd    $name -> $OPENCODE_ROOT/commands/  [opencode]"
      else
        note "cmd    $name -> $OPENCODE_ROOT/commands/  [shared]"
      fi
    done < <(opencode_command_names "$src")
  fi
done

if want opencode && [ -d "$ROOT/plugins/opencode" ]; then
  for p in "$ROOT"/plugins/opencode/*; do
    [ -e "$p" ] || continue
    note "plugin $(basename "$p") -> $OPENCODE_ROOT/plugins/"
  done
fi

if [ "$DO_INSTRUCTIONS" = 1 ]; then
  note "instructions -> $CLAUDE_ROOT/CLAUDE.md (@import), $OPENCODE_ROOT/AGENTS.md"
fi

# ── reporting / confirmation ───────────────────────────────────────────────────

echo "ai-config sync"
echo "  repo:     $ROOT"
echo "  profile:  $PROFILE  (${COMPONENTS[*]})"
echo "  target:   $TARGET"
echo "  scope:    $SCOPE${PROJECT_DIR:+ ($PROJECT_DIR)}"
echo "  skills:   $SHARED_SKILLS"
echo "  manifest: $MANIFEST"
[ "$DRY_RUN" = 1 ] && echo "  MODE:     dry run — nothing will be written"
echo
echo "Plan (${#PLAN[@]} operations):"
printf '  %s\n' "${PLAN[@]}"
echo

if [ "$DRY_RUN" = 1 ]; then echo "Dry run complete."; exit 0; fi

if [ "$ASSUME_YES" != 1 ]; then
  read -r -p "Proceed? [y/N] " reply
  case "$reply" in [yY]*) ;; *) echo "Aborted."; exit 0 ;; esac
fi

# ── install helpers ────────────────────────────────────────────────────────────

BACKUPS=()

backup_path() {  # $1 = absolute path, $2 = root the backup is kept under
  local path="$1" root="$2" rel
  { [ -e "$path" ] || [ -L "$path" ]; } || return 0
  rel="${path#"$root"/}"; [ "$rel" = "$path" ] && rel="$(basename "$path")"
  local bdir="$root/backup-$STAMP"
  mkdir -p "$bdir/$(dirname "$rel")"
  rm -rf "$bdir/$rel"
  cp -a "$path" "$bdir/$rel"
  BACKUPS+=("$bdir")
}

# Refuse to touch a path we did not install, unless --force.
guard() {
  local path="$1"
  { [ -e "$path" ] || [ -L "$path" ]; } || return 0
  is_managed "$path" && return 0
  [ "$FORCE" = 1 ] && return 0
  echo "refusing to overwrite unmanaged path: $path (pass --force)" >&2
  exit 1
}

install_skill() {  # $1 = source dir, $2 = destination, $3 = backup root
  local src="$1" dest="$2" broot="$3"
  CHANGED=0
  if [ "$LINK" = 1 ]; then
    if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then return 0; fi
    guard "$dest"; backup_path "$dest" "$broot"; rm -rf "$dest"; ln -s "$src" "$dest"
  else
    if [ -d "$dest" ] && [ ! -L "$dest" ] && diff -rq "$src" "$dest" >/dev/null 2>&1; then return 0; fi
    guard "$dest"; backup_path "$dest" "$broot"
    rm -rf "$dest"; mkdir -p "$(dirname "$dest")"; cp -a "$src" "$dest"
  fi
  CHANGED=1
}

install_file() {  # $1 = source file, $2 = destination dir, $3 = backup root
  local src="$1" dir="$2" broot="$3"
  local dest="$dir/$(basename "$src")"
  CHANGED=0
  mkdir -p "$dir"
  [ -f "$dest" ] && cmp -s "$src" "$dest" && return 0
  guard "$dest"; backup_path "$dest" "$broot"; rm -f "$dest"; cp -a "$src" "$dest"
  CHANGED=1
}

install_tree() {  # $1 = source dir/file, $2 = destination dir, $3 = backup root
  local src="$1" dir="$2" broot="$3" name
  name="$(basename "$src")"
  CHANGED=0
  [ -d "$dir/$name" ] && diff -rq "$src" "$dir/$name" >/dev/null 2>&1 && return 0
  guard "$dir/$name"; backup_path "$dir/$name" "$broot"
  rm -rf "$dir/$name"; mkdir -p "$dir"; cp -a "$src" "$dir/$name"
  CHANGED=1
}

# ── execution ──────────────────────────────────────────────────────────────────

mkdir -p "$SHARED_SKILLS"

for c in "${COMPONENTS[@]}"; do
  src="$ROOT/$c"

  for sk in "$src"/skills/*/; do
    [ -d "$sk" ] || continue
    name="$(basename "$sk")"
    [ -f "$sk/SKILL.md" ] || continue
    install_skill "${sk%/}" "$SHARED_SKILLS/$name" "$SKILLS_BACKUP_ROOT"
    [ "$CHANGED" = 1 ] && echo "→ skill $name"
    MANAGED+=("$SHARED_SKILLS/$name")

    # Claude Code looks for skills under ~/.claude/skills; point it at the shared copy.
    if want claude && [ "$SCOPE" = "global" ]; then
      mkdir -p "$CLAUDE_ROOT/skills"
      link="$CLAUDE_ROOT/skills/$name"
      CHANGED=0
      if [ -L "$link" ] && [ "$(readlink "$link")" = "$SHARED_SKILLS/$name" ]; then :
      else
        guard "$link"; backup_path "$link" "$CLAUDE_ROOT"; rm -rf "$link"
        ln -s "$SHARED_SKILLS/$name" "$link"; CHANGED=1
      fi
      [ "$CHANGED" = 1 ] && echo "→ link $name (claude)"
      MANAGED+=("$link")
    fi
  done

  if want claude; then
    for f in "$src"/agents/*.md; do
      [ -e "$f" ] || continue
      install_file "$f" "$CLAUDE_ROOT/agents" "$CLAUDE_ROOT"
      [ "$CHANGED" = 1 ] && echo "→ agent $(basename "$f") (claude)"
      MANAGED+=("$CLAUDE_ROOT/agents/$(basename "$f")")
    done
    for f in "$src"/commands/*.md; do
      [ -e "$f" ] || continue
      install_file "$f" "$CLAUDE_ROOT/commands" "$CLAUDE_ROOT"
      [ "$CHANGED" = 1 ] && echo "→ cmd $(basename "$f") (claude)"
      MANAGED+=("$CLAUDE_ROOT/commands/$(basename "$f")")
    done
  fi

  if want opencode; then
    for f in "$src"/opencode/agents/*.md; do
      [ -e "$f" ] || continue
      install_file "$f" "$OPENCODE_ROOT/agents" "$OPENCODE_ROOT"
      [ "$CHANGED" = 1 ] && echo "→ agent $(basename "$f") (opencode)"
      MANAGED+=("$OPENCODE_ROOT/agents/$(basename "$f")")
    done
    while IFS= read -r name; do
      [ -n "$name" ] || continue
      if [ -f "$src/opencode/commands/$name" ]; then
        install_file "$src/opencode/commands/$name" "$OPENCODE_ROOT/commands" "$OPENCODE_ROOT"
        [ "$CHANGED" = 1 ] && echo "→ cmd $name (opencode)"
      else
        install_file "$src/commands/$name" "$OPENCODE_ROOT/commands" "$OPENCODE_ROOT"
        [ "$CHANGED" = 1 ] && echo "→ cmd $name (shared)"
      fi
      MANAGED+=("$OPENCODE_ROOT/commands/$name")
    done < <(opencode_command_names "$src")
  fi
done

if want opencode && [ -d "$ROOT/plugins/opencode" ]; then
  for p in "$ROOT"/plugins/opencode/*; do
    [ -e "$p" ] || continue
    install_tree "$p" "$OPENCODE_ROOT/plugins" "$OPENCODE_ROOT"
    [ "$CHANGED" = 1 ] && echo "→ plugin $(basename "$p") (opencode)"
    MANAGED+=("$OPENCODE_ROOT/plugins/$(basename "$p")")
  done
fi

# ── instructions wiring ────────────────────────────────────────────────────────

if [ "$DO_INSTRUCTIONS" = 1 ]; then
  # OpenCode reads AGENTS.md directly.
  if want opencode; then
    mkdir -p "$OPENCODE_ROOT"
    if [ -f "$OPENCODE_ROOT/AGENTS.md" ] && cmp -s "$ROOT/AGENTS.md" "$OPENCODE_ROOT/AGENTS.md"; then
      :
    else
      guard "$OPENCODE_ROOT/AGENTS.md"
      backup_path "$OPENCODE_ROOT/AGENTS.md" "$OPENCODE_ROOT"
      cp -a "$ROOT/AGENTS.md" "$OPENCODE_ROOT/AGENTS.md"
      echo "→ AGENTS.md (opencode)"
    fi
    MANAGED+=("$OPENCODE_ROOT/AGENTS.md")
  fi

  # Claude Code reads CLAUDE.md; import the shared AGENTS.md rather than duplicating it.
  if want claude; then
    mkdir -p "$CLAUDE_ROOT"
    claude_md="$CLAUDE_ROOT/CLAUDE.md"
    import_line="@$ROOT/AGENTS.md"
    if [ -f "$claude_md" ] && grep -qF "$import_line" "$claude_md"; then
      echo "→ CLAUDE.md already imports AGENTS.md"
    else
      backup_path "$claude_md" "$CLAUDE_ROOT"
      printf '\n%s\n' "$import_line" >> "$claude_md"
      echo "→ CLAUDE.md: appended $import_line"
    fi
  fi
fi

# ── manifest ───────────────────────────────────────────────────────────────────

if [ ${#MANAGED[@]} -gt 0 ]; then
  mkdir -p "$(dirname "$MANIFEST")"
  printf '%s\n' "${MANAGED[@]}" | sort -u > "$MANIFEST"
  echo "→ manifest $MANIFEST"
fi

# ── summary ────────────────────────────────────────────────────────────────────

echo
echo "Sync complete."
echo "  profile: $PROFILE   target: $TARGET   scope: $SCOPE"
if [ ${#BACKUPS[@]} -gt 0 ]; then
  printf '  backup:  %s\n' "$(printf '%s\n' "${BACKUPS[@]}" | sort -u)"
fi
echo
echo "Restart Claude Code and run 'opencode service restart' so agents, commands and plugins"
echo "are picked up (skills and instructions reload live)."
