import type { FileEdit, Level, Metrics, Phase, ToolBucket } from '../types'
import { CHECK_COMMAND, formatElapsed } from './progress'

/**
 * The accounting behind the panel, kept pure so it can be tested without an
 * engine: what a turn cost, where the time went, what went wrong. Nothing here
 * touches `$` — `register.tsx` does the reading and writing.
 */

/** How many turns' durations and token totals are kept for the sparkline. */
export const TURN_RING = 32

/** How many times a file must be edited before it reads as churn. */
export const REPEAT_EDITS = 3

/** How many churned files the panel names. */
export const EDIT_RING = 6

/**
 * How many distinct files are tracked for churn. A session that touches
 * thousands of files would otherwise grow this map without end, re-encoding it
 * on every tool call; past the cap the least-edited file is dropped, which is
 * the one churn would never have named anyway.
 */
export const EDIT_TRACK = 200

/** Nothing spent, nothing done. */
export function emptyMetrics(): Metrics {
  return {
    turns: 0,
    subagentTurns: 0,
    tools: 0,
    toolsByBucket: {},
    skills: {},
    agents: {},
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    context: { tokens: 0, window: 0, percent: 0 },
    costUsd: 0,
    rateLimits: [],
    phaseMs: {},
    openPhase: null,
    openPhaseSince: 0,
    taskMs: {},
    openTaskId: null,
    openTaskSince: 0,
    turnDurations: [],
    turnTokens: [],
    failedTools: 0,
    erroredTurns: 0,
    abortedTurns: 0,
    checks: { runs: 0, failed: 0 },
    editCounts: {},
    lastToolAt: 0,
    lastToolName: null,
  }
}

/**
 * The metrics a new goal starts from. The counts and clocks below belong to the
 * goal and begin again; the tokens, context and cost are the engine's figures
 * for the *session*, reported cumulatively, and starting them over here would
 * put the panel at odds with `/cost`.
 */
export function restartMetrics(m: Metrics): Metrics {
  return {
    ...emptyMetrics(),
    tokens: m.tokens,
    context: m.context,
    costUsd: m.costUsd,
    rateLimits: m.rateLimits,
  }
}

/** The shape one turn's `usage` arrives in, whatever the engine calls it. */
export type TurnUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** Counts a turn the moment it starts, so the panel names it while it runs. */
export function countTurn(m: Metrics, isSubagent: boolean): Metrics {
  return isSubagent
    ? { ...m, subagentTurns: m.subagentTurns + 1 }
    : { ...m, turns: m.turns + 1 }
}

/**
 * Folds one finished turn in: what it cost, how long it took, and how it ended.
 * A turn that never reported usage still counts for its duration and its place
 * in the rings, so the series stay aligned with the turn count.
 */
export function addTurn(
  m: Metrics,
  turn: {
    usage?: TurnUsage | undefined
    durationMs: number
    isAborted: boolean
    reason: string
    /**
     * A turn a subagent ran. Its spend still counts, but it is not one of the
     * panel's turns — so it is kept out of the series drawn beside the count,
     * which would otherwise disagree with the number it sits next to.
     */
    isSubagent?: boolean
  },
): Metrics {
  const usage = turn.usage
  const tokens =
    usage === undefined
      ? m.tokens
      : {
          input: m.tokens.input + usage.input_tokens,
          output: m.tokens.output + usage.output_tokens,
          cacheRead: m.tokens.cacheRead + usage.cache_read_input_tokens,
          cacheWrite: m.tokens.cacheWrite + usage.cache_creation_input_tokens,
        }
  const spent =
    usage === undefined ? 0 : usage.input_tokens + usage.output_tokens
  return {
    ...m,
    tokens,
    turnDurations: turn.isSubagent === true ? m.turnDurations : pushRing(m.turnDurations, turn.durationMs),
    turnTokens: turn.isSubagent === true ? m.turnTokens : pushRing(m.turnTokens, spent),
    erroredTurns: m.erroredTurns + (turn.reason === 'error' ? 1 : 0),
    abortedTurns: m.abortedTurns + (turn.isAborted ? 1 : 0),
  }
}

/** Keeps a series to the last `TURN_RING` entries, newest last. */
function pushRing(values: readonly number[], value: number): number[] {
  const next = [...values, value]
  return next.length > TURN_RING ? next.slice(next.length - TURN_RING) : next
}

/**
 * Banks the wall-clock spent in the phase and on the step that were open, and
 * opens the ones now current. Phase and step are tracked as two independent
 * intervals — one can turn over while the other stands — so the split survives
 * a phase that flips away and back.
 */
export function accrueTime(
  m: Metrics,
  now: number,
  phase: Phase,
  taskId: string | null,
): Metrics {
  let phaseMs = m.phaseMs
  let openPhase = m.openPhase
  let openPhaseSince = m.openPhaseSince
  let taskMs = m.taskMs
  let openTaskId = m.openTaskId
  let openTaskSince = m.openTaskSince
  let changed = false

  if (openPhase !== phase) {
    if (openPhase !== null) {
      const spent = Math.max(0, now - openPhaseSince)
      phaseMs = { ...phaseMs, [openPhase]: (phaseMs[openPhase] ?? 0) + spent }
    }
    openPhase = phase
    openPhaseSince = now
    changed = true
  }
  if (openTaskId !== taskId) {
    if (openTaskId !== null) {
      const spent = Math.max(0, now - openTaskSince)
      taskMs = { ...taskMs, [openTaskId]: (taskMs[openTaskId] ?? 0) + spent }
    }
    openTaskId = taskId
    openTaskSince = now
    changed = true
  }
  // Opening an interval counts as a change: the clock has started even though
  // nothing has been banked against it yet.
  if (!changed) return m
  return { ...m, phaseMs, taskMs, openPhase, openPhaseSince, openTaskId, openTaskSince }
}

/** Wall-clock spent in a phase, the interval still running counted. */
export function phaseTime(m: Metrics, phase: Phase, now: number): number {
  const banked = m.phaseMs[phase] ?? 0
  return m.openPhase === phase ? banked + Math.max(0, now - m.openPhaseSince) : banked
}

/** Wall-clock spent on a step, the interval still running counted. */
export function taskTime(m: Metrics, taskId: string, now: number): number {
  const banked = m.taskMs[taskId] ?? 0
  return m.openTaskId === taskId ? banked + Math.max(0, now - m.openTaskSince) : banked
}

const READ_TOOLS = new Set(['Read', 'NotebookRead'])
const SEARCH_TOOLS = new Set(['Grep', 'Glob', 'WebSearch', 'WebFetch'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'BashOutput', 'KillShell'])
const TASK_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList'])

/** The kind of work a call is, for counting it. */
export function bucketOf(tool: string, args: Record<string, unknown>): ToolBucket {
  if (READ_TOOLS.has(tool)) return 'read'
  if (SEARCH_TOOLS.has(tool)) return 'search'
  if (EDIT_TOOLS.has(tool)) return 'edit'
  if (TASK_TOOLS.has(tool)) return 'task'
  if (tool === 'Skill') return 'skill'
  if (tool === 'Agent' || tool === 'Task') return 'agent'
  if (SHELL_TOOLS.has(tool)) return isCheck(tool, args) ? 'check' : 'shell'
  return 'other'
}

/**
 * Whether a shell call runs a check rather than changing something. Asked of
 * the command line, the same way the phase reads it.
 */
export function isCheck(tool: string, args: Record<string, unknown>): boolean {
  if (!SHELL_TOOLS.has(tool)) return false
  const command = typeof args.command === 'string' ? args.command : ''
  return CHECK_COMMAND.test(command)
}

/** The file an editing call touched, when it names one. */
function editPath(tool: string, args: Record<string, unknown>): string | null {
  if (!EDIT_TOOLS.has(tool)) return null
  const path = args.file_path ?? args.notebook_path
  return typeof path === 'string' && path.length > 0 ? path : null
}

/**
 * Records one tool call: what it was, whether it failed, and how long the panel
 * has been waiting on something. A failure is `isError` on the call's own
 * result — the engine's verdict, not a guess.
 */
export function noteTool(
  m: Metrics,
  tool: string,
  args: Record<string, unknown>,
  failed: boolean,
  now: number,
): Metrics {
  const bucket = bucketOf(tool, args)
  const check = isCheck(tool, args)
  const next: Metrics = {
    ...m,
    tools: m.tools + 1,
    toolsByBucket: { ...m.toolsByBucket, [bucket]: (m.toolsByBucket[bucket] ?? 0) + 1 },
    failedTools: m.failedTools + (failed ? 1 : 0),
    checks: check
      ? { runs: m.checks.runs + 1, failed: m.checks.failed + (failed ? 1 : 0) }
      : m.checks,
    lastToolAt: now,
    lastToolName: tool,
  }
  const path = editPath(tool, args)
  if (path === null) return next
  return { ...next, editCounts: bumpEdit(m.editCounts, path) }
}

/**
 * Counts one edit to a file, keeping the map to `EDIT_TRACK` entries by
 * dropping the least-edited once it is full.
 */
function bumpEdit(counts: Record<string, number>, path: string): Record<string, number> {
  const next = { ...counts, [path]: (counts[path] ?? 0) + 1 }
  const keys = Object.keys(next)
  if (keys.length <= EDIT_TRACK) return next
  let lowest = keys[0] as string
  for (const key of keys) {
    if ((next[key] ?? 0) < (next[lowest] ?? 0)) lowest = key
  }
  delete next[lowest]
  return next
}

/** Names a skill or an agent type as seen at work. */
export function noteName(
  m: Metrics,
  kind: 'skills' | 'agents',
  name: string,
): Metrics {
  const counts = m[kind]
  const next = { ...counts, [name]: (counts[name] ?? 0) + 1 }
  return kind === 'skills' ? { ...m, skills: next } : { ...m, agents: next }
}

/** The files edited repeatedly, worst first. */
export function churn(counts: Record<string, number>, limit = EDIT_RING): FileEdit[] {
  return Object.entries(counts)
    .filter(([, count]) => count >= REPEAT_EDITS)
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, limit)
}

/** The names in a count map, most used first. */
export function topNames(counts: Record<string, number>, limit = 4): string[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => `${name} ${count}`)
}

/** How a figure is doing, at the panel's own thresholds. */
export function levelOf(percent: number): Level {
  if (percent >= 90) return 'error'
  if (percent >= 75) return 'warning'
  return 'calm'
}

/** The theme key a level is drawn in, `undefined` for the default colour. */
export const LEVEL_COLOR: Record<Level, string | undefined> = {
  calm: undefined,
  warning: 'warning',
  error: 'error',
}

/** A token count as the panel reads it: `842`, `12.4k`, `1.2M`. */
export function formatTokens(count: number): string {
  const n = Math.max(0, Math.round(Number.isFinite(count) ? count : 0))
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    // Decided on the rounded figure, so 99_994 reads as `100k` and not the
    // clumsy `100.0k` that comparing the raw quotient would produce.
    const thousands = n / 1000
    const rounded = Math.round(thousands * 10) / 10
    return rounded >= 100 ? `${Math.round(thousands)}k` : `${rounded.toFixed(1)}k`
  }
  return `${(n / 1_000_000).toFixed(1)}M`
}

/** A dollar figure, cents until the sum is large enough not to need them. */
export function formatCost(usd: number): string {
  const value = Math.max(0, Number.isFinite(usd) ? usd : 0)
  return value >= 100 ? `$${Math.round(value)}` : `$${value.toFixed(2)}`
}

/** A wall-clock time of day from a timestamp: `14:20`. */export function formatClock(ms: number): string {
  const at = new Date(ms)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

/**
 * How long until a rate-limit window resets, or `null` when the engine gave no
 * reading or its stamp cannot be read.
 */
export function remainingTo(resetsAt: string | undefined, now: number): number | null {
  if (resetsAt === undefined) return null
  const at = Date.parse(resetsAt)
  return Number.isFinite(at) ? at - now : null
}

const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

/** The shortest block, drawn for the floor of a series. */
const SPARK_BASE = '▁'

/**
 * The session's figures as plain lines, for the clipboard. Written to be read
 * away from the terminal, so it names itself and spells the numbers out rather
 * than leaning on the panel's columns and glyphs.
 */
export function summaryText(input: {
  goal: string | null
  phase: Phase
  done: number
  total: number
  elapsedMs: number
  metrics: Metrics
}): string {
  const { metrics } = input
  const spent = metrics.tokens
  const lines: string[] = []
  lines.push(`plan-progress — ${input.goal ?? '(no goal)'}`)
  lines.push(
    `phase ${input.phase} · ${input.done}/${input.total} steps · ` +
      `${formatElapsed(input.elapsedMs)} · ${metrics.turns} turns`,
  )
  lines.push(
    `tokens in ${formatTokens(spent.input)} out ${formatTokens(spent.output)} ` +
      `cache ${formatTokens(spent.cacheRead + spent.cacheWrite)} · ` +
      `${formatCost(metrics.costUsd)} · ctx ${Math.round(metrics.context.percent)}%`,
  )
  lines.push(`tools ${metrics.tools} (${bucketLine(metrics)})`)
  const names = nameLines(metrics)
  if (names.length > 0) lines.push(names.join(' · '))
  lines.push(healthLine(metrics))
  return lines.join('\n')
}

/** `read 61 / edit 38`, most used first, for the summary's tools line. */
function bucketLine(m: Metrics): string {
  const parts = (Object.entries(m.toolsByBucket) as [ToolBucket, number][])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([bucket, count]) => `${bucket} ${count}`)
  return parts.length === 0 ? 'none' : parts.join(', ')
}

/** The skills and agents seen, when any were. */
function nameLines(m: Metrics): string[] {
  const lines: string[] = []
  const skills = topNames(m.skills)
  const agents = topNames(m.agents)
  if (skills.length > 0) lines.push(`skills ${skills.join(', ')}`)
  if (agents.length > 0) lines.push(`agents ${agents.join(', ')}`)
  const churned = churn(m.editCounts)
  if (churned.length > 0) {
    lines.push(`churn ${churned.map(f => `${f.path} ×${f.count}`).join(', ')}`)
  }
  return lines
}

/** The health line: what failed, or that nothing did. */
function healthLine(m: Metrics): string {
  const parts = [`${m.checks.runs} checks, ${m.checks.failed} failed`]
  if (m.failedTools > 0) parts.push(`${m.failedTools} failed calls`)
  if (m.erroredTurns > 0) parts.push(`${m.erroredTurns} errored turns`)
  if (m.abortedTurns > 0) parts.push(`${m.abortedTurns} aborted`)
  return `health ${parts.join(' · ')}`
}

/**
 * A series as a row of rising blocks, the newest last. Peak-relative, so the
 * shape is what shows. An empty series draws nothing; an all-zero one draws a
 * flat line, so its row keeps its place rather than appearing and vanishing.
 */
export function sparkline(values: readonly number[], width: number): string {
  if (width < 1) return ''
  const recent = values.length > width ? values.slice(values.length - width) : values
  if (recent.length === 0) return ''
  const peak = Math.max(...recent)
  if (peak <= 0) return SPARK_BASE.repeat(recent.length)
  return recent
    .map(value => {
      const step = Math.round((Math.max(0, value) / peak) * (SPARK.length - 1))
      const index = Math.min(SPARK.length - 1, Math.max(0, step))
      return SPARK[index] ?? SPARK_BASE
    })
    .join('')
}
