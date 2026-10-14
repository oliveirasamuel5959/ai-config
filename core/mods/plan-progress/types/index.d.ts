/**
 * The contract for `plan-progress`: the values it keeps in `$.state`, and the
 * plain data they hold. Self-contained on purpose — no imports.
 */

export type Phase = 'researching' | 'planning' | 'building' | 'testing' | 'auditing'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type TaskItem = {
  id: string
  subject: string
  status: TaskStatus
  activeForm?: string
  /** The skill last seen at work while this step was the active one. */
  skill?: string
  /** The agent type last seen at work while this step was the active one. */
  agent?: string
}

export type Goal = {
  text: string
  startedAt: number
  /** Set once every step is done, freezing the elapsed time. */
  endedAt?: number
  /** A /spec or /goal run: shown even before a checklist exists. */
  isExplicit: boolean
}

/** The kind of work a tool call is, for counting rather than for the phase. */
export type ToolBucket =
  | 'read'
  | 'search'
  | 'edit'
  | 'shell'
  | 'check'
  | 'task'
  | 'skill'
  | 'agent'
  | 'other'

/** A file and how many times it was edited. */
export type FileEdit = { path: string; count: number }

/** A rate-limit window, as the engine reports it. */
export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

/** How a figure is doing: what the panel tints it. */
export type Level = 'calm' | 'warning' | 'error'

/**
 * What the session has spent and what it has been doing — the numbers the
 * panel puts up while work runs. All of it is in memory for the session's
 * length; none of it is written anywhere.
 */
export type Metrics = {
  /** Turns the main thread ran, and turns a subagent ran for it. */
  turns: number
  subagentTurns: number
  /** Tool calls, in total and by kind. */
  tools: number
  toolsByBucket: Partial<Record<ToolBucket, number>>
  /** Skills and agent types seen at work, and how often. */
  skills: Record<string, number>
  agents: Record<string, number>
  /** Tokens spent, summed from each turn's own usage. */
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }
  /** The engine's figures for the live context window. */
  context: { tokens: number; window: number; percent: number }
  costUsd: number
  rateLimits: readonly RateLimit[]
  /** Wall-clock spent in each phase, banked as the phase turns over. */
  phaseMs: Partial<Record<Phase, number>>
  openPhase: Phase | null
  openPhaseSince: number
  /** Wall-clock spent on each checklist step, by task id. */
  taskMs: Record<string, number>
  openTaskId: string | null
  openTaskSince: number
  /** The last turns' durations and token totals, newest last. */
  turnDurations: number[]
  turnTokens: number[]
  /** Health: what went wrong, and where. */
  failedTools: number
  erroredTurns: number
  abortedTurns: number
  checks: { runs: number; failed: number }
  /** Every file edited this session, and how often. */
  editCounts: Record<string, number>
  lastToolAt: number
  lastToolName: string | null
}

export type View = 'goal' | 'metrics'

declare module 'claude-code' {
  interface PluginState {
    'plan-progress': {
      goal: Goal | null
      tasks: TaskItem[]
      signals: Phase[]
      metrics: Metrics
      view: View
      /** Ticks once a second while a goal runs, so elapsed time redraws. */
      nowTick: number
      isBandHidden: boolean
      /** Whether the person wants the panel on screen; hiding sets it false. */
      isPanelWanted: boolean
      /** Whether the hidden row carries the figures as well as the goal. */
      isBandMetrics: boolean
      lastSkill: string | null
      lastAgent: string | null
    }
  }
}
