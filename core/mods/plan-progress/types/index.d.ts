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
  turns: number
  tools: number
}

export type View = 'goal' | 'all'

/** What one session writes into `$.store`, so another session can list it. */
export type SessionRecord = {
  id: string
  dir: string
  goal: string | null
  phase: Phase
  done: number
  total: number
  startedAt: number
  updatedAt: number
  isWorking: boolean
  isComplete: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'plan-progress': {
      goal: Goal | null
      tasks: TaskItem[]
      signals: Phase[]
      view: View
      /** Ticks once a second while a goal runs, so elapsed time redraws. */
      nowTick: number
      sessions: SessionRecord[]
      isBandHidden: boolean
      /** Whether the person wants the panel on screen; hiding sets it false. */
      isPanelWanted: boolean
      lastSkill: string | null
      lastAgent: string | null
    }
  }
}
