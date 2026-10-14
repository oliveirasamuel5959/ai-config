import type { Goal, Phase, TaskItem } from '../types'

/**
 * The pure part of the mod: turning what the session is doing into a phase, a
 * checklist and a bar. Nothing here touches `$`, so it reads as ordinary code.
 */

export const PHASES: readonly Phase[] = [
  'researching',
  'planning',
  'building',
  'testing',
  'auditing',
]

/** Theme keys, so the panel follows the person's own theme. */
export const PHASE_COLOR: Record<Phase, string> = {
  researching: 'suggestion',
  planning: 'planMode',
  building: 'claude',
  testing: 'success',
  auditing: 'warning',
}

/** How many recent observations decide the phase. */
const WINDOW = 14

/**
 * How much one observation counts. A tool call is weak evidence — Claude reads
 * a file in the middle of building all the time. A skill or an agent the model
 * named is decisive: `code-review` means auditing is what is happening now.
 *
 * What a command names is weaker still: it says where the work starts, not
 * where it is. `/commit` opening planning-flavoured would otherwise outweigh
 * the four edits that follow it and pin the whole run to the wrong phase.
 */
export const WEAK = 1
export const STRONG = 3
export const OPENING = 2

/**
 * The phase the recent observations point at: the most frequent in the window,
 * the most recent breaking a tie. Each observation is one thing Claude did, so
 * a run of edits reads as building and a run of greps as researching, and the
 * window lets the phase turn over without any explicit signal.
 */
export function pickPhase(signals: readonly Phase[], fallback: Phase): Phase {
  if (signals.length === 0) return fallback
  const counts = new Map<Phase, number>()
  for (const phase of signals) counts.set(phase, (counts.get(phase) ?? 0) + 1)
  let best = fallback
  let bestCount = -1
  // Walk forwards so a later phase of equal count wins the tie.
  for (const phase of signals) {
    const count = counts.get(phase) ?? 0
    if (count >= bestCount) {
      best = phase
      bestCount = count
    }
  }
  return best
}

/** Keeps the window bounded, dropping the oldest observations. */
export function pushSignal(
  signals: readonly Phase[],
  phase: Phase,
  weight: number = WEAK,
): Phase[] {
  const added: Phase[] = []
  for (let index = 0; index < weight; index += 1) added.push(phase)
  const next = [...signals, ...added]
  return next.length > WINDOW ? next.slice(next.length - WINDOW) : next
}

const RESEARCH_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'])

const BUILD_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const PLAN_TOOLS = new Set([
  'TodoWrite',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'EnterPlanMode',
  'ExitPlanMode',
])

/** A command that runs a check rather than changes something. */
export const CHECK_COMMAND =
  /\b(pytest|vitest|jest|mocha|rspec|go\s+test|cargo\s+test|npm\s+(run\s+)?test|pnpm\s+test|yarn\s+test|make\s+test|typecheck|type-check|tsc\b|lint|eslint|ruff|flake8|mypy|pyright|gradle\s+test|mvn\s+test)\b/

/** The phase a tool call points at, or undefined when it points at none. */
export function phaseOfTool(
  tool: string,
  args: Record<string, unknown>,
): Phase | undefined {
  if (RESEARCH_TOOLS.has(tool)) return 'researching'
  if (BUILD_TOOLS.has(tool)) return 'building'
  if (PLAN_TOOLS.has(tool)) return 'planning'
  if (tool === 'Bash' || tool === 'BashOutput') {
    const command = typeof args.command === 'string' ? args.command : ''
    return CHECK_COMMAND.test(command) ? 'testing' : undefined
  }
  return undefined
}

const AUDIT_WORD = /review|audit|security|critique/
const PLAN_WORD = /spec|plan|design/
const TEST_WORD = /test|verify|check|lint|qa\b/
const RESEARCH_WORD = /explore|research|search|find|investigate|ask/

/** The phase a name points at, read off it; `building` for a maker. */
function phaseOfName(name: string): Phase | undefined {
  const lower = name.toLowerCase()
  if (AUDIT_WORD.test(lower)) return 'auditing'
  if (PLAN_WORD.test(lower)) return 'planning'
  if (TEST_WORD.test(lower)) return 'testing'
  if (RESEARCH_WORD.test(lower)) return 'researching'
  return undefined
}

/** The phase a skill points at, read off its name. */
export function phaseOfSkill(skill: string): Phase | undefined {
  return phaseOfName(skill)
}

/** The phase an agent type points at, read off its name. */
export function phaseOfAgent(type: string): Phase | undefined {
  const named = phaseOfName(type)
  if (named !== undefined) return named
  const lower = type.toLowerCase()
  if (lower === 'general-purpose' || lower === 'claude') return 'building'
  return undefined
}

const AUDIT_COMMAND = /review|audit|security/
const TEST_COMMAND = /test|verify|check|lint|qa\b/
const PLAN_COMMAND = /spec|goal|plan|design/

/** The phase a slash command points at. */
export function phaseOfCommand(command: string): Phase | undefined {
  const lower = command.toLowerCase()
  if (PLAN_COMMAND.test(lower)) return 'planning'
  if (AUDIT_COMMAND.test(lower)) return 'auditing'
  if (TEST_COMMAND.test(lower)) return 'testing'
  return undefined
}

/**
 * The phase a tool call points at, asked of the call as the engine spells it.
 * A tool's own name comes first; a skill or an agent it carries is asked next,
 * so `Skill{ code-review }` reads as auditing and `Agent{ Explore }` as
 * researching.
 */
export function phaseOfCall(e: {
  tool: string
  [argument: string]: unknown
}): Phase | undefined {
  const byTool = phaseOfTool(e.tool, e)
  if (byTool !== undefined) return byTool
  if (e.tool === 'Skill' && typeof e.skill === 'string') return phaseOfSkill(e.skill)
  if (e.tool === 'Agent') {
    const type = typeof e.subagent_type === 'string' ? e.subagent_type : 'general-purpose'
    return phaseOfAgent(type)
  }
  return undefined
}

/**
 * Commands that drive the session rather than do work: they are not goals.
 * Every other working slash command is, because `/commit` or `/pr` is a task
 * with a beginning and an end — exactly what is worth monitoring — even
 * though nothing about it says "goal" out loud.
 */
const SESSION_COMMANDS = new Set([
  'add-dir', 'agents', 'bug', 'clear', 'compact', 'config', 'context', 'cost',
  'doctor', 'exit', 'export', 'feedback', 'help', 'hooks', 'login', 'logout',
  'mcp', 'memory', 'model', 'output-style', 'permissions', 'plugin', 'privacy',
  'quit', 'release-notes', 'resume', 'rewind', 'sandbox', 'status', 'statusline',
  'tasks', 'terminal-setup', 'theme', 'todos', 'usage', 'vim',
])

/**
 * Whether a prompt opens a goal, and what to call it.
 *
 * `/spec` and `/goal` take their words as the goal. Any other working command
 * is a goal named after itself — `/commit` is a task the person deliberately
 * started, so the panel and the row should both take it up at once.
 *
 * Either way the goal is *explicit*: it is worth a row from the first moment,
 * unlike a passing question, which waits until there is a checklist to show.
 * A session-control command is not a goal at all.
 */
export function goalOfPrompt(
  text: string,
): { text: string; isExplicit: boolean } | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined

  const command = /^\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\s*([\s\S]*)$/.exec(trimmed)
  if (command !== null) {
    const name = (command[1] ?? '').toLowerCase()
    if (SESSION_COMMANDS.has(name)) return undefined
    const rest = (command[2] ?? '').trim()
    const isSpec = name === 'spec' || name === 'goal'
    // `/spec add retries` reads as "add retries"; `/commit` reads as itself.
    return { text: isSpec && rest.length > 0 ? rest : trimmed, isExplicit: true }
  }

  return { text: trimmed, isExplicit: false }
}

export function countDone(tasks: readonly TaskItem[]): number {
  return tasks.filter(task => task.status === 'completed').length
}

export function percentOf(tasks: readonly TaskItem[]): number {
  if (tasks.length === 0) return 0
  return Math.round((countDone(tasks) / tasks.length) * 100)
}

/** The step the panel names as current: the active one, else the next pending. */
export function currentTask(tasks: readonly TaskItem[]): TaskItem | undefined {
  return (
    tasks.find(task => task.status === 'in_progress') ??
    tasks.find(task => task.status === 'pending')
  )
}

/** The step a skill or an agent seen right now is attributed to. */
export function attributeTarget(tasks: readonly TaskItem[]): TaskItem | undefined {
  return tasks.find(task => task.status === 'in_progress')
}

export function isComplete(tasks: readonly TaskItem[]): boolean {
  return tasks.length > 0 && tasks.every(task => task.status === 'completed')
}

const EMPTY_CELL = '░'
const FULL_CELL = '█'

/** A bar of `width` cells for a fraction from 0 to 1. */
export function bar(fraction: number, width: number): string {
  const safe = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  const filled = Math.min(width, Math.max(0, Math.round(safe * width)))
  return FULL_CELL.repeat(filled) + EMPTY_CELL.repeat(Math.max(0, width - filled))
}

/** Converts a phase to a fraction from 0 to 1. */
export function fractionOf(percent: number): number {
  return Math.min(1, Math.max(0, percent / 100))
}

/**
 * Cells a string takes on screen. This is what any column arithmetic has to
 * count: a wide glyph (CJK, fullwidth, most emoji) takes two cells, a combining
 * mark none. Everything else takes one — including the box, bar and status
 * glyphs this mod draws itself, which terminals render narrow.
 */
export function displayWidth(text: string): number {
  let cells = 0
  for (const char of text) cells += widthOf(char)
  return cells
}

/** The cells one glyph takes: 0, 1 or 2. */
function widthOf(char: string): number {
  const code = char.codePointAt(0) ?? 0
  // Combining marks and the zero-width formatting characters add nothing.
  if ((code >= 0x300 && code <= 0x36f) || code === 0xfeff) return 0
  if (code >= 0x200b && code <= 0x200f) return 0
  const isWide =
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK radicals, Kangxi, ideographic space
    (code >= 0x3041 && code <= 0x33ff) || // kana, CJK symbols and punctuation
    (code >= 0x3400 && code <= 0x4dbf) || // CJK extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK unified ideographs
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility ideographs
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) || // fullwidth forms
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f1e6 && code <= 0x1f1ff) || // regional indicators
    (code >= 0x1f300 && code <= 0x1f6ff) || // pictographs, transport, symbols
    (code >= 0x1f900 && code <= 0x1f9ff) || // supplemental symbols
    (code >= 0x1fa70 && code <= 0x1faff) || // extended-A symbols
    (code >= 0x20000 && code <= 0x3fffd) // CJK extension B and beyond
  return isWide ? 2 : 1
}

/**
 * Cuts text to `limit` screen cells, counting a wide glyph as two — so what it
 * returns lines up in a column, which counting code points does not.
 */
export function truncate(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (limit < 1) return ''
  if (displayWidth(flat) <= limit) return flat
  let taken = ''
  let used = 0
  // One cell is held back for the ellipsis.
  for (const char of flat) {
    const cells = widthOf(char)
    if (used + cells > limit - 1) break
    taken += char
    used += cells
  }
  return `${taken}…`
}

/**
 * What a scrolled list says about itself: the rows in view and the total.
 * `null` at the top, where the window needs no explaining.
 */
export function scrollNote(
  offset: number,
  bodyRows: number,
  total: number,
): string | null {
  if (offset <= 0 || total === 0) return null
  const first = Math.min(offset + 1, total)
  const last = Math.min(offset + Math.max(1, bodyRows), total)
  return `↕ ${first}–${last} of ${total}`
}

/** A short duration: `42s`, `12m 04s`, `1h 02m`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  if (hours > 0) return `${hours}h ${pad(minutes)}m`
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`
  return `${seconds}s`
}

/** A short age, as a session list reads it: `now`, `4m`, `2h`, `3d`. */
export function formatAge(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 45) return 'now'
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** Cells the bar may take in a body of `columns`, the text around it counted. */
export function barWidth(columns: number): number {
  return Math.max(6, Math.min(32, columns - 48))
}

/** The last path segment, so a session reads as its folder. */
export function dirName(path: string): string {
  const parts = path.split('/').filter(part => part.length > 0)
  return parts[parts.length - 1] ?? path
}

/** Elapsed time for a goal: frozen once it ended. */
export function elapsedOf(goal: Goal, now: number): number {
  return (goal.endedAt ?? now) - goal.startedAt
}

/** Whether the goal is worth a panel at all: anything a session set going. */
export function hasGoal(goal: Goal | null): boolean {
  return goal !== null
}

/**
 * Whether the band above the prompt earns its rows: a checklist exists, or the
 * goal came from /spec or /goal. A plain prompt that has not been broken down
 * yet leaves the band alone.
 */
export function shouldShowBand(goal: Goal | null, tasks: readonly TaskItem[]): boolean {
  return goal !== null && (tasks.length > 0 || goal.isExplicit)
}
