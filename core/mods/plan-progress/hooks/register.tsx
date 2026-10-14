import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { Goal, Phase, TaskItem, ToolBucket, View } from '../types'
import {
  accrueTime,
  addTurn,
  churn,
  countTurn,
  emptyMetrics,
  formatClock,
  formatCost,
  formatTokens,
  levelOf,
  LEVEL_COLOR,
  noteName,
  noteTool,
  phaseTime,
  remainingTo,
  restartMetrics,
  sparkline,
  summaryText,
  taskTime,
  topNames,
} from './metrics'
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
  scrollNote,
  shouldShowBand,
  truncate,
  OPENING,
  STRONG,
  WEAK,
} from './progress'

const PANE = 'plan-progress'

// Each reference spells `plugin` and `key` as literals: the engine's scan for
// the contract reads them off the source, so a const holding them will not do.
const goalAtom = atom({ plugin: 'plan-progress', key: 'goal' } as const, null)
const tasksAtom = atom({ plugin: 'plan-progress', key: 'tasks' } as const, [])
const signalsAtom = atom({ plugin: 'plan-progress', key: 'signals' } as const, [])
const metricsAtom = atom({ plugin: 'plan-progress', key: 'metrics' } as const, emptyMetrics())
const viewAtom = atom({ plugin: 'plan-progress', key: 'view' } as const, 'metrics')
const tickAtom = atom({ plugin: 'plan-progress', key: 'nowTick' } as const, 0)
const hiddenAtom = atom({ plugin: 'plan-progress', key: 'isBandHidden' } as const, false)
const wantedAtom = atom({ plugin: 'plan-progress', key: 'isPanelWanted' } as const, true)
const bandMetricsAtom = atom({ plugin: 'plan-progress', key: 'isBandMetrics' } as const, true)
const skillAtom = atom({ plugin: 'plan-progress', key: 'lastSkill' } as const, null)
const agentAtom = atom({ plugin: 'plan-progress', key: 'lastAgent' } as const, null)

/**
 * A backstop on a list, not a window. The pane draws its rows whole and the
 * surface's own window moves over them, told where it stands by
 * `e.props.scroll` — so slicing to a small number here would put rows beyond
 * it out of reach of the scroll rather than merely hiding them.
 */
const LIST_CAP = 200

/**
 * How long a live goal may go without a tool call before the panel mentions it.
 * Dim and uncoloured: a long thinking turn is normal, not a fault — the line is
 * there to say the session is still alive, not to raise an alarm.
 */
const QUIET_MS = 60_000

/** The order tool kinds are listed in, so the row does not shuffle about. */
const BUCKET_ORDER: readonly ToolBucket[] = [
  'read',
  'search',
  'edit',
  'shell',
  'check',
  'task',
  'skill',
  'agent',
  'other',
]

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

/**
 * Banks the time up to `now` against the phase and the step that are current.
 *
 * Called wherever either can turn over — the once-a-second clock, and every
 * observation that moves the phase — so the split is taken at the moment the
 * work changed rather than at the next tick. A phase that lasts under a second
 * is then still counted, and one that turns over mid-second is not credited
 * with the seconds that followed it.
 */
async function bank($: $T, now: number): Promise<void> {
  const tasks = await read($, tasksAtom)
  const phase = phaseNow(await read($, signalsAtom), tasks)
  const working = attributeTarget(tasks)
  await update($, metricsAtom, m => accrueTime(m, now, phase, working?.id ?? null))
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
  }
  await update($, goalAtom, () => goal)
  await update($, tasksAtom, () => [])
  await update($, signalsAtom, () => found.isExplicit ? ['planning' as Phase] : [])
  await update($, metricsAtom, restartMetrics)
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

/** The line naming the skill and the agent at work, when either is known. */
function attributionLine(skill: string | null, agent: string | null): string {
  const parts: string[] = []
  if (skill !== null) parts.push(`skill ${skill}`)
  if (agent !== null) parts.push(`agent ${agent}`)
  return parts.join(' · ')
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
 *
 * With the panel gone the figures come here too, so hiding the monitor is not
 * the same as giving up the numbers; `/plan-progress band off` leaves the row
 * as it was, naming nothing but the goal.
 */
async function minimalRow($: $T, e: RenderInput<'AbovePrompt'>): Promise<RenderElement> {
  const { Box, Button, Text } = $.ui.resolve(e)
  const isBandMetrics = await read($, bandMetricsAtom)
  const metrics = isBandMetrics ? await read($, metricsAtom) : null
  const fiveHour = metrics?.rateLimits.find(limit => limit.kind === 'five_hour')
  const ctx = metrics?.context.percent ?? 0
  const hasFigures =
    metrics !== null &&
    (metrics.tools > 0 || metrics.turns > 0 || ctx > 0 || metrics.rateLimits.length > 0)

  return (
    <Box flexDirection="column">
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
      {hasFigures && metrics !== null && (
        <Box>
          <Text dimColor tabular>
            ↑{formatTokens(metrics.tokens.input)} ↓{formatTokens(metrics.tokens.output)} ·{' '}
            {formatCost(metrics.costUsd)}
          </Text>
          <Text color={LEVEL_COLOR[levelOf(ctx)]} tabular>
            {' · ctx '}
            {Math.round(ctx)}%
          </Text>
          {fiveHour !== undefined && (
            <Text color={LEVEL_COLOR[levelOf(fiveHour.percentUsed)]} tabular>
              {' · 5h '}
              {Math.round(fiveHour.percentUsed)}%
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}

export const register: Register = (on, options) => {
  /** Whether the checklist was ever given by a real task list. */
  let isRunning = false
  let lastPlacedTryAt = Number.NEGATIVE_INFINITY

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'plan-progress',
      description: 'Show the running goal: phase, steps, progress and elapsed',
      argumentHint: '[metrics|goal|copy|band|hide|show|clear]',
    })

    // The engine's own session figures, read once so the panel has the context
    // and the cost before the first turn finishes. With no arguments — no
    // breakdown asked for — this costs nothing.
    const usage = await $.session.usage().catch(() => undefined)
    if (usage !== undefined) {
      await update($, metricsAtom, m => ({
        ...m,
        context: {
          tokens: usage.context.tokens ?? 0,
          window: usage.context.window,
          percent: usage.context.percent ?? 0,
        },
        rateLimits: usage.rateLimits,
        costUsd: usage.cost?.usd ?? m.costUsd,
      }))
    }

    // The panel is a monitor: it comes up with the session and stays docked
    // beside the transcript. Unasked it is placed only where the layout docks
    // a pane (the terminal's fullscreen one, from 144 columns), so on a narrow
    // terminal or the main screen it waits undrawn rather than taking over.
    const opened = await placePanel($)
    if (!opened) {
      $.ui.log('plan-progress: the panel waits undrawn until the terminal is wide enough.')
    }

    // The clock redraws the elapsed time and banks each second against the
    // phase and the step that are current.
    $.clock.every(1000, () => {
      void (async () => {
        const goal = await read($, goalAtom)
        if (goal === null || goal.endedAt !== undefined) return
        await update($, tickAtom, value => value + 1)
        const now = await $.clock.now()
        await bank($, now)
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
    // Counted here so the panel names the running turn, not the last finished.
    await update($, metricsAtom, m => countTurn(m, e.agentId !== undefined))
    await bank($, now)
    isRunning = true

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    const tasks = await read($, tasksAtom)
    await settleGoal($, tasks, now)
    // What the turn cost and how long it took — read here, where the engine
    // hands it over, rather than guessed at from the transcript.
    await update($, metricsAtom, m =>
      addTurn(m, {
        usage: e.usage ?? undefined,
        durationMs: e.durationMs,
        isAborted: e.isAborted,
        reason: e.reason,
        isSubagent: e.agentId !== undefined,
      }),
    )
    await update($, tickAtom, value => value + 1)

    return next(e)
  })

  // The engine pushes the live figures after each main-thread turn, and when a
  // rate-limit window moves. There is nothing to compute or poll — the context
  // window and the cost are the engine's own, as the status line shows them.
  on('session.measure', async ($, e, next) => {
    await update($, metricsAtom, m => ({
      ...m,
      context: {
        tokens: e.context.tokens ?? 0,
        window: e.context.window,
        percent: e.context.percent ?? 0,
      },
      rateLimits: e.rateLimits,
      costUsd: e.cost?.usd ?? m.costUsd,
    }))
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
    const now = await $.clock.now()
    const call = e as unknown as { tool: string; [k: string]: unknown }
    const phase = phaseOfCall(call)
    const isNamed = e.tool === 'Skill' || e.tool === 'Agent'
    await signal($, phase, isNamed ? STRONG : WEAK)
    // Counted after the call ran, so its own verdict — `isError` — is known.
    await update($, metricsAtom, m => noteTool(m, e.tool, call, ran.isError === true, now))
    // The call may have moved the phase; bank the time up to it now, so the
    // phase it left is credited with the seconds it actually held.
    await bank($, now)

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
    return ran
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('skill.prompt', async ($, e, next) => {
    const phase = phaseOfSkill(e.skill)
    await signal($, phase, STRONG)
    await attributeSkill($, e.skill)
    await update($, metricsAtom, m => noteName(m, 'skills', e.skill))
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
    await update($, metricsAtom, m => noteName(m, 'agents', e.subagentType))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'plan-progress' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()

    if (arg === 'clear') {
      await update($, goalAtom, () => null)
      await update($, tasksAtom, () => [])
      await update($, signalsAtom, () => [])
      await update($, metricsAtom, emptyMetrics)
      return { text: 'Plan Progress: cleared.' }
    }
    if (arg === 'copy') {
      const now = await $.clock.now()
      const metrics = await read($, metricsAtom)
      const tasks = await read($, tasksAtom)
      const goal = await read($, goalAtom)
      const text = summaryText({
        goal: goal?.text ?? null,
        phase: phaseNow(await read($, signalsAtom), tasks),
        done: countDone(tasks),
        total: tasks.length,
        elapsedMs: goal === null ? 0 : elapsedOf(goal, now),
        metrics,
      })
      const copied = await $.ui.copy({ text }).catch(() => undefined)
      return {
        text:
          copied?.isCopied === true
            ? 'Plan Progress: the summary is on the clipboard.'
            : 'Plan Progress: nothing to copy into on this surface.',
      }
    }
    if (arg === 'band' || arg.startsWith('band ')) {
      const want = arg.slice('band'.length).trim() !== 'off'
      await update($, bandMetricsAtom, () => want)
      repaint($)
      return {
        text: want
          ? 'Plan Progress: the row carries the figures while the panel is hidden.'
          : 'Plan Progress: the row carries the goal alone.',
      }
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

    // No argument opens the numbers: that is what the panel is for now.
    const view: View = arg === 'goal' ? 'goal' : 'metrics'
    await update($, viewAtom, () => view)
    const opened = await placePanel($)
    if (!opened) {
      return { text: 'Plan Progress: widen the terminal to see the panel.' }
    }
    if (view === 'goal' && !hasGoal(await read($, goalAtom))) {
      return { text: 'Plan Progress: no goal is running yet. Start one, or try /spec.' }
    }
    return {
      text:
        view === 'goal'
          ? 'Plan Progress: the checklist is open.'
          : 'Plan Progress: the metrics are open.',
    }
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
          <Text color={PHASE_COLOR[phase]} weight="semibold">
            {done ? '✓ done' : `◆ ${phase}`}{' '}
          </Text>
          <Text dimColor>{truncate(goal?.text ?? '', room)}</Text>
        </Box>
        <Box>
          <Text color={PHASE_COLOR[phase]}>{bar(fractionOf(percent), width)}</Text>
          <Text tabular> {percent}% </Text>
          <Text dimColor tabular>
            {countDone(tasks)}/{tasks.length} · {elapsed}
          </Text>
          {current !== undefined && (
            <Text dimColor> · {truncate(current.subject, 28)}</Text>
          )}
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
          key="tab-metrics"
          plain
          hotkey="1"
          onPress={() => {
            void update($, viewAtom, () => 'metrics').then(() => repaint($))
          }}
        >
          <Text weight={view === 'metrics' ? 'semibold' : 'regular'}>Metrics</Text>
        </Button>
        <Text dimColor> | </Text>
        <Button
          key="tab-goal"
          plain
          hotkey="2"
          onPress={() => {
            void update($, viewAtom, () => 'goal').then(() => repaint($))
          }}
        >
          <Text weight={view === 'goal' ? 'semibold' : 'regular'}>Goal</Text>
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

    if (view === 'metrics') {
      const metrics = await read($, metricsAtom)
      const tasks = await read($, tasksAtom)
      const goal = await read($, goalAtom)
      const width = barWidth(columns)
      // Four figures across need room for two label/value columns and the gap.
      const isWide = columns >= 64

      const spent = metrics.tokens
      const totalSpent = spent.input + spent.output + spent.cacheRead + spent.cacheWrite
      const live = goal !== null && goal.endedAt === undefined
      const quiet = live && metrics.lastToolAt > 0 ? now - metrics.lastToolAt : 0

      const times = PHASES.map(name => ({
        name,
        ms: phaseTime(metrics, name, now),
      }))
        // The phase in progress is always listed, even before it has earned a
        // second: the panel should say where the work is, not only where it was.
        .filter(entry => entry.ms > 0 || entry.name === metrics.openPhase)
        .sort((a, b) => b.ms - a.ms)
      const totalTime = times.reduce((sum, entry) => sum + entry.ms, 0)

      const buckets = BUCKET_ORDER.map(bucket => ({
        bucket,
        count: metrics.toolsByBucket[bucket] ?? 0,
      })).filter(entry => entry.count > 0)

      const skills = topNames(metrics.skills)
      const agents = topNames(metrics.agents)
      const churned = churn(metrics.editCounts)
      const troubles = [
        metrics.failedTools > 0
          ? `${metrics.failedTools} failed ${metrics.failedTools === 1 ? 'call' : 'calls'}`
          : null,
        metrics.erroredTurns > 0
          ? `${metrics.erroredTurns} errored ${metrics.erroredTurns === 1 ? 'turn' : 'turns'}`
          : null,
        metrics.abortedTurns > 0 ? `${metrics.abortedTurns} aborted` : null,
      ].filter((part): part is string => part !== null)

      // A label and its figure. Padded rather than flexed, so the columns line
      // up down the pane the way a table of figures should.
      const row = (label: string, value: string, right?: string, rightValue?: string) => (
        <Box>
          <Text dimColor>{`  ${label.padEnd(7)}`}</Text>
          <Text tabular>{value.padStart(9)}</Text>
          {right !== undefined && rightValue !== undefined && (
            <Text dimColor>{`    ${right.padEnd(7)}`}</Text>
          )}
          {right !== undefined && rightValue !== undefined && (
            <Text tabular>{rightValue.padStart(9)}</Text>
          )}
        </Box>
      )

      const onePerLine = (left: [string, string], right: [string, string]) =>
        isWide ? row(left[0], left[1], right[0], right[1]) : (
          <>
            {row(left[0], left[1])}
            {row(right[0], right[1])}
          </>
        )

      return (
        <Box flexDirection="column">
          {tabs}
          <Text dimColor>{'─'.repeat(Math.max(1, Math.min(columns, 60)))}</Text>

          {!hasGoal(goal) && metrics.tools === 0 ? (
            <Text dimColor>Nothing measured yet — run something and the numbers fill in.</Text>
          ) : (
            <>
              <Text weight="semibold">Tokens</Text>
              {onePerLine(
                ['in', formatTokens(spent.input)],
                ['out', formatTokens(spent.output)],
              )}
              {onePerLine(
                ['cache', formatTokens(spent.cacheRead + spent.cacheWrite)],
                ['total', formatTokens(totalSpent)],
              )}
              {onePerLine(
                ['cost', formatCost(metrics.costUsd)],
                ['turns', String(metrics.turns)],
              )}
              <Text dimColor tabular>
                {'  turns '}
                {String(metrics.turns).padStart(3)}
                {'  '}
                {sparkline(metrics.turnDurations, Math.max(8, Math.min(width, 32)))}
              </Text>

              <Text> </Text>
              <Text weight="semibold">Context</Text>
              <Box>
                <Text color={LEVEL_COLOR[levelOf(metrics.context.percent)]} tabular>
                  {`  ${String(Math.round(metrics.context.percent)).padStart(3)}%`}
                </Text>
                <Text color={LEVEL_COLOR[levelOf(metrics.context.percent)]}>
                  {`  ${bar(metrics.context.percent / 100, width)}`}
                </Text>
                <Text dimColor tabular>
                  {`  ${formatTokens(metrics.context.tokens)} / ${formatTokens(metrics.context.window)}`}
                </Text>
              </Box>

              <Text> </Text>
              <Text weight="semibold">Limits</Text>
              {metrics.rateLimits.length === 0 && (
                <Text dimColor>  no window reported</Text>
              )}
              {metrics.rateLimits.map(limit => {
                const level = levelOf(limit.percentUsed)
                const left = remainingTo(limit.resetsAt, now)
                const label =
                  limit.kind === 'five_hour'
                    ? '5h'
                    : limit.kind === 'seven_day'
                      ? '7d'
                      : truncate(limit.kind, 6)
                return (
                  <Box key={limit.kind}>
                    <Text dimColor>{`  ${label.padEnd(4)}`}</Text>
                    <Text color={LEVEL_COLOR[level]} tabular>
                      {`${String(Math.round(limit.percentUsed)).padStart(3)}%`}
                    </Text>
                    <Text color={LEVEL_COLOR[level]}>{`  ${bar(limit.percentUsed / 100, width)}`}</Text>
                    {left !== null && left > 0 && (
                      <Text dimColor tabular>
                        {`  resets ${formatClock(now + left)} (${formatAge(left)})`}
                      </Text>
                    )}
                  </Box>
                )
              })}

              <Text> </Text>
              <Text weight="semibold">Time by phase</Text>
              {times.length === 0 && <Text dimColor>  nothing has run yet</Text>}
              {times.map(entry => {
                const share = totalTime === 0 ? 0 : entry.ms / totalTime
                return (
                  <Box key={entry.name}>
                    <Text dimColor>{`  ${entry.name.padEnd(11)}`}</Text>
                    <Text tabular>{formatElapsed(entry.ms).padStart(8)}</Text>
                    <Text color={PHASE_COLOR[entry.name]}>{`  ${bar(share, width)}`}</Text>
                    <Text dimColor tabular>
                      {`  ${String(Math.round(share * 100)).padStart(3)}%`}
                    </Text>
                  </Box>
                )
              })}

              <Text> </Text>
              <Text weight="semibold">Activity</Text>
              <Box>
                <Text dimColor>{`  ${String(metrics.tools).padStart(4)} tools`}</Text>
              </Box>
              {buckets.length > 0 && (
                <Box>
                  <Text dimColor>{'  '}</Text>
                  <Text tabular>
                    {buckets.map(entry => `${entry.bucket} ${entry.count}`).join(' · ')}
                  </Text>
                </Box>
              )}
              {skills.length > 0 && (
                <Box>
                  <Text dimColor>{'  skills '}</Text>
                  <Text>{skills.join(' · ')}</Text>
                </Box>
              )}
              {agents.length > 0 && (
                <Box>
                  <Text dimColor>{'  agents '}</Text>
                  <Text>{agents.join(' · ')}</Text>
                </Box>
              )}
              {churned.length > 0 && (
                <Box>
                  <Text dimColor>{'  churn  '}</Text>
                  <Text color="warning">
                    {churned
                      .map(entry => `${dirName(entry.path)} ×${entry.count}`)
                      .join(' · ')}
                  </Text>
                </Box>
              )}

              <Text> </Text>
              <Text weight="semibold">Health</Text>
              <Box>
                <Text color={metrics.checks.failed > 0 ? 'error' : 'success'}>
                  {metrics.checks.failed > 0 ? '  ⚠ ' : '  ✓ '}
                </Text>
                <Text tabular>
                  {metrics.checks.runs}{' '}
                  {metrics.checks.runs === 1 ? 'check' : 'checks'}, {metrics.checks.failed} failed
                </Text>
              </Box>
              {troubles.length > 0 && (
                <Box>
                  <Text color="warning">{'  ⚠ '}</Text>
                  <Text dimColor tabular>
                    {troubles.join(' · ')}
                  </Text>
                </Box>
              )}
              {quiet > QUIET_MS && (
                <Box>
                  <Text dimColor>
                    {'  no tool call for '}
                    {formatAge(quiet)}
                  </Text>
                </Box>
              )}
            </>
          )}

          <Text dimColor>
            /plan-progress goal · copy · band · hide · show · clear
          </Text>
        </Box>
      )
    }

    const goal = await read($, goalAtom)
    const tasks = await read($, tasksAtom)
    const skill = await read($, skillAtom)
    const agent = await read($, agentAtom)
    const metrics = await read($, metricsAtom)
    const phase = phaseNow(await read($, signalsAtom), tasks)
    const percent = percentOf(tasks)
    const width = barWidth(columns)
    const current = currentTask(tasks)
    const done = goal !== null && goal.endedAt !== undefined
    const attribution = attributionLine(skill, agent)
    const hasSteps = tasks.length > 0
    const note = scrollNote(e.props.scroll.offset, e.props.scroll.bodyRows, tasks.length)

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
        {note !== null && <Text dimColor>{note}</Text>}
        <Box>
          <Text weight="semibold">Goal  </Text>
          <Text>{truncate(goal?.text ?? '', Math.max(12, columns - 8))}</Text>
        </Box>
        <Box>
          <Text weight="semibold">Phase </Text>
          <Text color={PHASE_COLOR[phase]} weight="semibold">
            {phase}
          </Text>
          {done && (
            <Text color="success" weight="semibold">
              {' '}
              complete
            </Text>
          )}
          {attribution.length > 0 && (
            <Text dimColor> · {truncate(attribution, Math.max(8, columns - 24))}</Text>
          )}
        </Box>
        {/* A goal with no checklist yet has no progress to draw: the panel
            says what it is waiting for rather than an empty bar at 0%. */}
        {hasSteps && (
          <Box>
            <Text color={PHASE_COLOR[phase]}>{bar(fractionOf(percent), width)}</Text>
            <Text tabular weight="semibold">
              {' '}
              {String(percent).padStart(3)}%
            </Text>
            <Text dimColor tabular>
              {'  '}
              {countDone(tasks)}/{tasks.length} steps · {formatElapsed(elapsedOf(goal as Goal, now))} ·{' '}
              {metrics.turns} {metrics.turns === 1 ? 'turn' : 'turns'}
            </Text>
          </Box>
        )}
        <Text> </Text>
        <Box>
          <Text weight="semibold">Steps</Text>
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
        {tasks.slice(0, LIST_CAP).map(task => {
          const stepMs = taskTime(metrics, task.id, now)
          return (
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
              <Text
                dimColor={task.status === 'completed'}
                weight={task.status === 'in_progress' ? 'semibold' : 'regular'}
              >
                {truncate(task.subject, Math.max(16, columns - 26))}
              </Text>
              {/* How long the step took — banked once it turns over, and
                  counting up live while it is the one being worked on. */}
              {stepMs > 0 && (
                <Text dimColor tabular>
                  {'  '}
                  {formatElapsed(stepMs)}
                </Text>
              )}
              {(task.skill !== undefined || task.agent !== undefined) && (
                <Text dimColor>
                  {'  '}
                  {task.skill !== undefined ? `@${task.skill}` : ''}
                  {task.skill !== undefined && task.agent !== undefined ? ' ' : ''}
                  {task.agent !== undefined ? `◇${task.agent}` : ''}
                </Text>
              )}
            </Box>
          )
        })}
        {tasks.length > LIST_CAP && <Text dimColor>… {tasks.length - LIST_CAP} more</Text>}
        <Text dimColor>
          /plan-progress metrics · copy · band · hide · show · clear
        </Text>
      </Box>
    )
  })
}
