import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { Goal, Phase, SessionRecord, TaskItem, View } from '../types'
import {
  PHASES,
  PHASE_COLOR,
  attributeTarget,
  bar,
  barWidth,
  countDone,
  currentTask,
  dirName,
  elapsedOf,
  formatAge,
  formatElapsed,
  fractionOf,
  goalOfPrompt,
  hasGoal,
  isComplete,
  percentOf,
  phaseOfAgent,
  phaseOfCall,
  phaseOfCommand,
  phaseOfSkill,
  pickPhase,
  pushSignal,
  shouldShowBand,
  truncate,
  OPENING,
  STRONG,
  WEAK,
} from './progress'

const PANE = 'plan-progress'
const OWNER = 'plan-progress'

// Each reference spells `plugin` and `key` as literals: the engine's scan for
// the contract reads them off the source, so a const holding them will not do.
const goalAtom = atom({ plugin: 'plan-progress', key: 'goal' } as const, null)
const tasksAtom = atom({ plugin: 'plan-progress', key: 'tasks' } as const, [])
const signalsAtom = atom({ plugin: 'plan-progress', key: 'signals' } as const, [])
const viewAtom = atom({ plugin: 'plan-progress', key: 'view' } as const, 'goal')
const tickAtom = atom({ plugin: 'plan-progress', key: 'nowTick' } as const, 0)
const sessionsAtom = atom({ plugin: 'plan-progress', key: 'sessions' } as const, [])
const hiddenAtom = atom({ plugin: 'plan-progress', key: 'isBandHidden' } as const, false)
const wantedAtom = atom({ plugin: 'plan-progress', key: 'isPanelWanted' } as const, true)
const skillAtom = atom({ plugin: 'plan-progress', key: 'lastSkill' } as const, null)
const agentAtom = atom({ plugin: 'plan-progress', key: 'lastAgent' } as const, null)

/** A session record older than this is one that ended without saying so. */
const STALE_MS = 24 * 60 * 60 * 1000

/** Rows of checklist the pane draws before it says how many it left out. */
const MAX_ROWS = 40

/** How often the panel is asked for again while it waits to be placed. */
const PLACE_RETRY_MS = 10_000

type $T = EngineInterface

/**
 * The phase of the goal as it stands: what the recent observations point at,
 * falling back to the checklist's own shape before anything has been seen.
 */
function phaseNow(signals: readonly Phase[], tasks: readonly TaskItem[]): Phase {
  const started = tasks.some(task => task.status !== 'pending')
  return pickPhase(signals, started ? 'building' : 'planning')
}

/** Records one observation and its phase, keeping the window bounded. */
async function signal($: $T, phase: Phase | undefined, weight = WEAK): Promise<void> {
  if (phase === undefined) return
  await update($, signalsAtom, list => pushSignal(list, phase, weight))
}

/** Repaints every site this plugin draws, after a change the readers missed. */
function repaint($: $T): void {
  $.ui.invalidate('ui.render')
}

/** Folds the todo list a TodoWrite call carried into the checklist. */
function fromTodos(
  todos: readonly { content: string; status: TaskItem['status']; activeForm: string }[],
  previous: readonly TaskItem[],
): TaskItem[] {
  return todos.map((todo, index) => {
    const was = previous[index]
    const same = was !== undefined && was.subject === todo.content
    return {
      id: `todo:${index}`,
      subject: todo.content,
      status: todo.status,
      activeForm: todo.activeForm,
      // Attribution carries over while a row keeps its place and its words.
      ...(same && was.skill !== undefined ? { skill: was.skill } : {}),
      ...(same && was.agent !== undefined ? { agent: was.agent } : {}),
    }
  })
}

/** Attributes the skill at work to the step it is working on. */
async function attributeSkill($: $T, skill: string): Promise<void> {
  await update($, skillAtom, () => skill)
  await update($, tasksAtom, tasks => {
    const target = attributeTarget(tasks)
    if (target === undefined) return tasks
    return tasks.map(task =>
      task.id === target.id ? { ...task, skill } : task,
    )
  })
}

/** Attributes the agent at work to the step it is working on. */
async function attributeAgent($: $T, agent: string): Promise<void> {
  await update($, agentAtom, () => agent)
  await update($, tasksAtom, tasks => {
    const target = attributeTarget(tasks)
    if (target === undefined) return tasks
    return tasks.map(task => (task.id === target.id ? { ...task, agent } : task))
  })
}

/** Starts a goal for a prompt, when the prompt is one. */
async function beginGoal(
  $: $T,
  text: string,
  now: number,
  isRunning: boolean,
): Promise<void> {
  const found = goalOfPrompt(text)
  if (found === undefined) return
  // A plain prompt leaves a goal that is still running alone.
  if (!found.isExplicit && isRunning) return
  const goal: Goal = {
    text: truncate(found.text, 400),
    startedAt: now,
    isExplicit: found.isExplicit,
    turns: 0,
    tools: 0,
  }
  await update($, goalAtom, () => goal)
  await update($, tasksAtom, () => [])
  await update($, signalsAtom, () => found.isExplicit ? ['planning' as Phase] : [])
  await update($, skillAtom, () => null)
  await update($, agentAtom, () => null)
}

/** Freezes the elapsed time once every step is done. */
async function settleGoal($: $T, tasks: readonly TaskItem[], now: number): Promise<void> {
  if (!isComplete(tasks)) return
  await update($, goalAtom, goal =>
    goal !== null && goal.endedAt === undefined ? { ...goal, endedAt: now } : goal,
  )
}

/** Writes this session's row for the "All tasks" view. */
async function publish($: $T, now: number, isWorking: boolean): Promise<void> {
  const id = await $.session.id()
  const goal = await read($, goalAtom)
  const tasks = await read($, tasksAtom)
  const signals = await read($, signalsAtom)
  const dir = await $.session.cwd()
  const record: SessionRecord = {
    id,
    dir: dirName(dir),
    goal: goal === null ? null : goal.text,
    phase: phaseNow(signals, tasks),
    done: countDone(tasks),
    total: tasks.length,
    startedAt: goal?.startedAt ?? now,
    updatedAt: now,
    isWorking,
    isComplete: tasks.length > 0 && isComplete(tasks),
  }
  await $.store.set(`session:${id}`, record)
}

function parseRecord(raw: unknown): SessionRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.updatedAt !== 'number') return undefined
  if (typeof row.phase !== 'string' || !PHASES.includes(row.phase as Phase)) return undefined
  return {
    id: row.id,
    dir: typeof row.dir === 'string' ? row.dir : '',
    goal: typeof row.goal === 'string' ? row.goal : null,
    phase: row.phase as Phase,
    done: typeof row.done === 'number' ? row.done : 0,
    total: typeof row.total === 'number' ? row.total : 0,
    startedAt: typeof row.startedAt === 'number' ? row.startedAt : row.updatedAt,
    updatedAt: row.updatedAt,
    isWorking: row.isWorking === true,
    isComplete: row.isComplete === true,
  }
}

/** Reads every other session's row, dropping the ones gone quiet. */
async function refreshSessions($: $T, now: number): Promise<void> {
  const own = await $.session.id()
  const keys = await $.store.keys()
  const rows: SessionRecord[] = []
  for (const key of keys) {
    if (!key.startsWith('session:')) continue
    const record = parseRecord(await $.store.get(key))
    if (record === undefined) continue
    if (now - record.updatedAt > STALE_MS) {
      await $.store.delete(key)
      continue
    }
    // The panel already draws this session's own goal.
    if (record.id === own) continue
    rows.push(record)
  }
  rows.sort((a, b) => b.updatedAt - a.updatedAt)
  await update($, sessionsAtom, () => rows)
}

/** The line naming the skill and the agent at work, when either is known. */
function attributionLine(skill: string | null, agent: string | null): string {
  const parts: string[] = []
  if (skill !== null) parts.push(`skill ${skill}`)
  if (agent !== null) parts.push(`agent ${agent}`)
  return parts.join('  ·  ')
}

/**
 * Asks for the panel and says whether it is now drawn. An open id is only
 * retitled, so this is safe to call whenever the panel should be up. Holds
 * off while the person has hidden it — that is the one thing worse than not
 * asking, since it would bring the panel back the moment they hid it.
 */
async function placePanel($: $T): Promise<boolean> {
  try {
    if (!(await read($, wantedAtom))) return false
    const opened = await $.ui.open({ id: PANE, title: 'Plan Progress' })
    return opened.isPlaced
  } catch {
    return false
  }
}

/**
 * What the band draws while the monitor is hidden: one short line, and the
 * `show` that brings it back. Keeping this here is what makes `hide` safe —
 * without it, hiding would carry off the only control that could undo it.
 */
async function minimalRow($: $T, e: RenderInput<'AbovePrompt'>): Promise<RenderElement> {
  const { Box, Button, Text } = $.ui.resolve(e)
  return (
    <Box>
      <Text dimColor>plan-progress </Text>
      <Button
        key="panel"
        hotkey="p"
        plain
        onPress={() => {
          void (async () => {
            // `show` means show everything, as the command's does: hiding
            // turned both off, so this turns both back on before asking.
            await update($, hiddenAtom, () => false)
            await update($, wantedAtom, () => true)
            await placePanel($)
            repaint($)
          })()
        }}
      >
        show
      </Button>
    </Box>
  )
}

export const register: Register = (on, options) => {
  /** Whether the checklist was ever given by a real task list. */
  let isRunning = false
  let ticks = 0
  let lastPlacedTryAt = Number.NEGATIVE_INFINITY

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'plan-progress',
      description: 'Show the running goal: phase, steps, progress and elapsed',
      argumentHint: '[all|goal|hide|show|clear]',
    })

    // The panel is a monitor: it comes up with the session and stays docked
    // beside the transcript. Unasked it is placed only where the layout docks
    // a pane (the terminal's fullscreen one, from 144 columns), so on a narrow
    // terminal or the main screen it waits undrawn rather than taking over.
    const opened = await placePanel($)
    if (!opened) {
      $.ui.log('plan-progress: the panel waits undrawn until the terminal is wide enough.')
    }

    // The clock redraws the elapsed time, and now and then republishes this
    // session's row and re-reads the others.
    $.clock.every(1000, () => {
      void (async () => {
        const goal = await read($, goalAtom)
        if (goal === null || goal.endedAt !== undefined) return
        ticks += 1
        await update($, tickAtom, value => value + 1)
        const now = await $.clock.now()
        if (ticks % 15 === 0) await publish($, now, true).catch(() => {})
        const view = await read($, viewAtom)
        if (view === 'all' && ticks % 3 === 0) {
          await refreshSessions($, now).catch(() => {})
        }
      })().catch(() => {})
    })

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    const goal = await read($, goalAtom)
    isRunning = goal !== null && goal.endedAt === undefined
    await beginGoal($, e.text, now, isRunning)
    // Any *other* working command says what kind of work this is, so `/commit`
    // opens as committing rather than as whatever it touches first. `/spec`
    // and `/goal` are left alone: `beginGoal` already seeds those, and saying
    // it twice is what pins the phase to planning for the whole run. It counts
    // for more than nothing but less than a tool call — a command says where
    // the work starts, not where it has got to.
    const command = /^\/([a-zA-Z0-9][a-zA-Z0-9_-]*)/.exec(e.text.trim())
    const name = (command?.[1] ?? '').toLowerCase()
    if (name !== '' && name !== 'spec' && name !== 'goal') {
      await signal($, phaseOfCommand(name), OPENING)
    }
    await update($, goalAtom, current =>
      current === null ? current : { ...current, turns: current.turns + 1 },
    )
    isRunning = true
    await publish($, now, true).catch(() => {})

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const tasks = await read($, tasksAtom)
    await settleGoal($, tasks, now)
    await publish($, now, false).catch(() => {})
    await update($, tickAtom, value => value + 1)

    return next(e)
  })

  // The checklist, from either task tool the session may be using. The
  // phase these calls point at is recorded by the catch-all below.
  on(
    'tool.call',
    { tool: 'TodoWrite' },
    async ($, e, next) => {
      if (e.agentId === undefined) {
        const todos = e.todos
        await update($, tasksAtom, previous => fromTodos(todos, previous))
      }
      return next(e)
    },
  ).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on(
    'tool.call',
    { tool: 'TaskCreate' },
    async ($, e, next) => {
      const ran = await next(e)
      if (ran.deny === undefined && ran.isError !== true) {
        const record = ran.result as { task?: { id?: string; subject?: string } } | undefined
        const id = record?.task?.id
        if (typeof id === 'string') {
          const item: TaskItem = {
            id,
            subject: record?.task?.subject ?? e.subject,
            status: 'pending',
          }
          await update($, tasksAtom, list => [...list, item])
        }
      }
      return ran
    },
  ).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on(
    'tool.call',
    { tool: 'TaskUpdate' },
    async ($, e, next) => {
      const ran = await next(e)
      if (ran.deny === undefined && ran.isError !== true) {
        await update($, tasksAtom, list =>
          e.status === 'deleted'
            ? list.filter(task => task.id !== e.taskId)
            : list.map(task =>
                task.id === e.taskId
                  ? {
                      ...task,
                      ...(e.status === undefined || e.status === 'deleted'
                        ? {}
                        : { status: e.status }),
                      ...(e.subject === undefined ? {} : { subject: e.subject }),
                    }
                  : task,
              ),
        )
      }
      return ran
    },
  ).catch(($, e, next) => (next.called ? next(e) : next(e)))

  // Every other call is an observation: the phase comes from the window, and a
  // skill or an agent at work is pinned to the step it is working on. A skill
  // the model asked for by name counts for more than a tool call, which is
  // weak evidence — one read in the middle of an edit says little.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const call = e as unknown as { tool: string; [k: string]: unknown }
    const phase = phaseOfCall(call)
    const isNamed = e.tool === 'Skill' || e.tool === 'Agent'
    await signal($, phase, isNamed ? STRONG : WEAK)

    if (e.agentId === undefined) {
      if (e.tool === 'Skill' && typeof e.skill === 'string') {
        await attributeSkill($, e.skill)
      }
      if (e.tool === 'Agent') {
        const type =
          typeof e.subagent_type === 'string' ? e.subagent_type : 'general-purpose'
        await attributeAgent($, type)
      }
    }
    await update($, goalAtom, goal =>
      goal === null ? goal : { ...goal, tools: goal.tools + 1 },
    )
    return ran
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('skill.prompt', async ($, e, next) => {
    const phase = phaseOfSkill(e.skill)
    await signal($, phase, STRONG)
    await attributeSkill($, e.skill)
    return next(e)
  })

  // A skill or a command the person runs by name: /code-review is auditing,
  // /spec is planning, and the panel should say so before a tool call lands.
  // An observer that fails is skipped and the command runs regardless.
  on('command.run', async ($, e, next) => {
    if (e.command !== 'plan-progress') {
      const phase = phaseOfCommand(e.command)
      await signal($, phase, STRONG)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    await signal($, phaseOfAgent(e.subagentType), STRONG)
    await attributeAgent($, e.subagentType)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'plan-progress' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    const now = await $.clock.now()

    if (arg === 'clear') {
      await update($, goalAtom, () => null)
      await update($, tasksAtom, () => [])
      await update($, signalsAtom, () => [])
      await $.store.delete(`session:${await $.session.id()}`)
      return { text: 'Plan Progress: cleared.' }
    }
    if (arg === 'hide') {
      // The master switch: the panel goes, and so does the row that would
      // otherwise invite it back. `/plan-progress show` restores both.
      await update($, wantedAtom, () => false)
      await update($, hiddenAtom, () => true)
      repaint($)
      await $.ui.close({ id: PANE }).catch(() => {})
      return { text: 'Plan Progress: hidden. `/plan-progress show` brings it back.' }
    }
    if (arg === 'show') {
      await update($, wantedAtom, () => true)
      await update($, hiddenAtom, () => false)
      $.ui.invalidate('ui.render')
      const shown = await placePanel($)
      return {
        text: shown
          ? 'Plan Progress: shown.'
          : 'Plan Progress: shown in the row; the panel needs a wider terminal.',
      }
    }

    const view: View = arg === 'all' ? 'all' : 'goal'
    await update($, viewAtom, () => view)
    if (view === 'all') await refreshSessions($, now).catch(() => {})
    const opened = await placePanel($)
    const goal = await read($, goalAtom)
    const label = view === 'all' ? 'All tasks' : 'Plan Progress'
    if (!opened) {
      return { text: `${label}: widen the terminal to see the panel.` }
    }
    if (view === 'goal' && !hasGoal(goal)) {
      return { text: 'Plan Progress: no goal is running yet. Start one, or try /spec.' }
    }
    return { text: `${label} is open.` }
  })

  // The panel deliberately has no `ui.close` hook. A hook that answers without
  // `next` keeps the pane open, which is the one thing this must not do: the
  // hide button and the engine's own close mark both close it by going through.

  // The panel is placed once the terminal has been measured: an unasked open
  // at session start can land before the surface knows its width, and below
  // the dock floor it waits undrawn. So the band's own drawing, which is
  // handed a viewport, asks again at most every ten seconds — which is also
  // what brings the panel back should the engine's close mark take it away.
  // A hidden panel is left hidden: `isPanelWanted` is what the person set.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport?.isFullscreen !== false) {
      try {
        const now = await $.clock.now()
        if (now - lastPlacedTryAt > PLACE_RETRY_MS) {
          lastPlacedTryAt = now
          if ((await read($, wantedAtom)) && !(await read($, hiddenAtom))) {
            await placePanel($)
          }
        }
      } catch {
        // Whatever went wrong here, the band still draws.
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const goal = await read($, goalAtom)
    const tasks = await read($, tasksAtom)
    const hidden = await read($, hiddenAtom)

    if (e.props.hasSurvey) return next(e)

    // Three states, and no fourth. Hidden: one short line carrying the `show`
    // that brings it back, so hiding never carries off its own undo. Nothing
    // to report yet: out of the way entirely. Otherwise: the full readout.
    const hasReport = shouldShowBand(goal, tasks)
    if (hidden) return minimalRow($, e)
    if (!hasReport) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    // The tick's read is what subscribes this drawing, so the elapsed time
    // keeps counting down without anyone asking for a repaint.
    await read($, tickAtom)
    const isPanelWanted = await read($, wantedAtom)
    const now = await $.clock.now()
    const phase = phaseNow(await read($, signalsAtom), tasks)
    const percent = percentOf(tasks)
    const width = barWidth(e.props.bodyColumns)
    const room = Math.max(12, e.props.bodyColumns - width - 22)
    const current = currentTask(tasks)
    const elapsed = formatElapsed(elapsedOf(goal as Goal, now))
    const done = goal !== null && goal.endedAt !== undefined

    return (
      <Box flexDirection="column">
        <Box>
          <Text color={PHASE_COLOR[phase]} bold>
            {done ? '✓ done' : `◆ ${phase}`}{' '}
          </Text>
          <Text dimColor>{truncate(goal?.text ?? '', room)}</Text>
        </Box>
        <Box>
          <Text color={PHASE_COLOR[phase]}>{bar(fractionOf(percent), width)}</Text>
          <Text> {percent}% </Text>
          <Text dimColor>
            {countDone(tasks)}/{tasks.length} · {elapsed}
            {current === undefined ? '' : ` · ${truncate(current.subject, 28)}`}
          </Text>
          <Button
            key="panel"
            hotkey="p"
            plain
            dimColor
            onPress={() => {
              // One toggle for the whole monitor, matching `/plan-progress
              // hide` and `show`: the panel and the row that offers it.
              void (async () => {
                const want = !isPanelWanted
                await update($, wantedAtom, () => want)
                await update($, hiddenAtom, () => !want)
                if (want) {
                  await placePanel($)
                } else {
                  await $.ui.close({ id: PANE }).catch(() => {})
                }
                repaint($)
              })()
            }}
          >
            {isPanelWanted ? ' hide' : ' show'}
          </Button>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const view = await read($, viewAtom)
    const now = await $.clock.now()
    const columns = e.props.bodyColumns

    const isPanelWanted = await read($, wantedAtom)

    const tabs = (
      <Box>
        <Button
          key="tab-goal"
          plain
          hotkey="1"
          onPress={() => {
            void update($, viewAtom, () => 'goal').then(() => repaint($))
          }}
        >
          <Text bold={view === 'goal'}>Goal</Text>
        </Button>
        <Text dimColor> | </Text>
        <Button
          key="tab-all"
          plain
          hotkey="2"
          onPress={() => {
            void (async () => {
              await update($, viewAtom, () => 'all')
              await refreshSessions($, await $.clock.now())
              repaint($)
            })()
          }}
        >
          <Text bold={view === 'all'}>All tasks</Text>
        </Button>
        <Text dimColor>   </Text>
        <Button
          key="hide"
          plain
          hotkey="h"
          dimColor
          onPress={() => {
            // Hides the panel and the row with it, as `/plan-progress hide`
            // does: the row's `show` is what brings them back.
            void (async () => {
              await update($, wantedAtom, () => false)
              await update($, hiddenAtom, () => true)
              repaint($)
              await $.ui.close({ id: PANE }).catch(() => {})
            })()
          }}
        >
          hide
        </Button>
      </Box>
    )

    if (view === 'all') {
      const sessions = await read($, sessionsAtom)
      return (
        <Box flexDirection="column">
          {tabs}
          <Text dimColor>
            {'─'.repeat(Math.max(1, Math.min(columns, 60)))}
          </Text>
          {sessions.length === 0 && (
            <Text dimColor>No other session is running a goal.</Text>
          )}
          {sessions.slice(0, MAX_ROWS).map(session => {
            const percent =
              session.total === 0 ? 0 : Math.round((session.done / session.total) * 100)
            const width = barWidth(columns)
            const mark = session.isWorking ? '●' : session.isComplete ? '✓' : '○'
            return (
              <Box key={session.id} flexDirection="column">
                <Box>
                  <Text color={PHASE_COLOR[session.phase]} bold>
                    {mark}{' '}
                  </Text>
                  <Text>{truncate(session.goal ?? '(no goal)', Math.max(10, columns - 6))}</Text>
                </Box>
                <Box>
                  <Text>{'   '}</Text>
                  <Text color={PHASE_COLOR[session.phase]}>{bar(fractionOf(percent), width)}</Text>
                  <Text bold> {String(percent).padStart(3)}%</Text>
                  <Text dimColor>
                    {'  '}
                    {session.phase}
                    {' · '}
                    {session.done}/{session.total}
                    {' · '}
                    {formatAge(now - session.updatedAt)}
                    {' · '}
                    {session.dir}
                  </Text>
                </Box>
              </Box>
            )
          })}
          {sessions.length > MAX_ROWS && (
            <Text dimColor>… {sessions.length - MAX_ROWS} more</Text>
          )}
        </Box>
      )
    }

    const goal = await read($, goalAtom)
    const tasks = await read($, tasksAtom)
    const skill = await read($, skillAtom)
    const agent = await read($, agentAtom)
    const phase = phaseNow(await read($, signalsAtom), tasks)
    const percent = percentOf(tasks)
    const width = barWidth(columns)
    const current = currentTask(tasks)
    const done = goal !== null && goal.endedAt !== undefined
    const attribution = attributionLine(skill, agent)
    const hasSteps = tasks.length > 0

    if (!hasGoal(goal)) {
      return (
        <Box flexDirection="column">
          {tabs}
          <Text dimColor>No goal is running in this session.</Text>
          <Text dimColor>
            Ask for something, or run /spec, and the panel fills in from there.
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {tabs}
        <Text dimColor>{'─'.repeat(Math.max(1, Math.min(columns, 60)))}</Text>
        <Box>
          <Text bold>Goal  </Text>
          <Text>{truncate(goal?.text ?? '', Math.max(12, columns - 8))}</Text>
        </Box>
        <Box>
          <Text bold>Phase </Text>
          <Text color={PHASE_COLOR[phase]} bold>
            {phase}
          </Text>
          {done && <Text color="success" bold>  complete</Text>}
          {attribution.length > 0 && (
            <Text dimColor>  ·  {truncate(attribution, Math.max(8, columns - 24))}</Text>
          )}
        </Box>
        {/* A goal with no checklist yet has no progress to draw: the panel
            says what it is waiting for rather than an empty bar at 0%. */}
        {hasSteps && (
          <Box>
            <Text color={PHASE_COLOR[phase]}>{bar(fractionOf(percent), width)}</Text>
            <Text bold> {String(percent).padStart(3)}%</Text>
            <Text dimColor>
              {'  '}
              {countDone(tasks)}/{tasks.length} steps
              {'  ·  '}
              {formatElapsed(elapsedOf(goal as Goal, now))}
              {'  ·  '}
              {goal?.turns ?? 0} {(goal?.turns ?? 0) === 1 ? 'turn' : 'turns'}
            </Text>
          </Box>
        )}
        <Text> </Text>
        <Box>
          <Text bold>Steps</Text>
          {current !== undefined && (
            <Text dimColor>
              {'  '}
              now: {truncate(current.activeForm ?? current.subject, Math.max(8, columns - 12))}
            </Text>
          )}
        </Box>
        {!hasSteps && (
          <Text dimColor>
            No checklist yet — Claude writes one once the work is broken down.
          </Text>
        )}
        {tasks.slice(0, MAX_ROWS).map(task => (
          <Box key={task.id}>
            <Text
              color={
                task.status === 'completed'
                  ? 'success'
                  : task.status === 'in_progress'
                    ? 'claude'
                    : undefined
              }
            >
              {task.status === 'completed' ? ' ✓ ' : task.status === 'in_progress' ? ' ▶ ' : ' ○ '}
            </Text>
            <Text dimColor={task.status === 'completed'} bold={task.status === 'in_progress'}>
              {truncate(task.subject, Math.max(16, columns - 26))}
            </Text>
            {(task.skill !== undefined || task.agent !== undefined) && (
              <Text dimColor>
                {'  '}
                {task.skill !== undefined ? `@${task.skill}` : ''}
                {task.skill !== undefined && task.agent !== undefined ? ' ' : ''}
                {task.agent !== undefined ? `◇${task.agent}` : ''}
              </Text>
            )}
          </Box>
        ))}
        {tasks.length > MAX_ROWS && <Text dimColor>… {tasks.length - MAX_ROWS} more</Text>}
        <Text dimColor>
          /plan-progress all · hide · show · clear — hide takes the panel and the row away
        </Text>
      </Box>
    )
  })

  on('session.end', async ($, e, next) => {
    await $.store.delete(`session:${e.sessionId}`).catch(() => {})
    return next(e)
  })
}
