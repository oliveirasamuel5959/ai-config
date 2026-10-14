import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { TaskItem } from '../types'

const PLUGIN = 'plan-progress'
const PANE = 'plan-progress'

const PANE_PROPS = {
  title: 'Plan Progress',
  isFocused: false,
  bodyColumns: 80,
  placement: 'inline' as const,
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
}

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 6,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 5 },
  view: {},
}

type Test$ = Engine
type TestOn = On

/**
 * The world a session gives the mod: an id, a directory, a clock the test
 * moves, and a bottom that answers what is called on it.
 *
 * The pane bookkeeping is real, so what `$.ui.open`, `$.ui.close` and
 * `$.ui.panes` do to each other is what a session does: hiding closes the
 * pane, a later show opens it again, and the test reads `panes` to see where
 * it stands.
 *
 * Every hook beneath the plugins is registered here, before the test's first
 * call on `$`: the kit asks for them once, when the plugins load.
 */
function world($: Test$, on: TestOn, canPlace = true) {
  const clock = mock.clock(on)
  const panes = new Set<string>()
  const answer = () =>
    canPlace
      ? { value: { isPlaced: true } as const }
      : { value: { isPlaced: false as const, reason: 'below 144 columns' } }

  on('session.id', () => ({ value: 's-1' }))
  on('session.cwd', () => ({ value: '/home/sam/projects/demo' }))
  on('session.start', () => ({ cwd: '/home/sam/projects/demo' }))
  // The engine pushes these after each main-thread turn.
  on('session.measure', () => ({ changed: [] }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: 0, window: 200_000, percent: 0 },
      rateLimits: [],
      cost: { usd: 0 },
    },
  }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('turn.complete', () => ({ text: 'ok' }))
  // Flipped by a test that wants a tool call to come back failed, which is how
  // the engine reports one: `isError` on the call's own result.
  const toolFailures = { value: false }
  on('tool.call', () => ({ result: null, isError: toolFailures.value }))
  on('ui.open', () => {
    if (canPlace) panes.add(PANE)
    return answer()
  })
  on('ui.close', () => {
    panes.delete(PANE)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...panes].map(id => ({
      id,
      title: 'Plan Progress',
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }))
  on('command.run', () => ({ text: 'ran' }))
  // Flipped by a test that wants the clipboard refused, as a surface without
  // one answers.
  const copyFails = { value: false }
  on('ui.copy', () => ({
    value: copyFails.value
      ? ({ isCopied: false, reason: 'no-surface' } as const)
      : ({ isCopied: true } as const),
  }))
  // The bottom the band's own drawing lands on, so a mount is answered from
  // beneath the plugin rather than running off the end of the chain.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' as const }))
  return { clock, panes, toolFailures, copyFails }
}

/** Pushes the live session figures, as the engine does after a main-thread turn. */
function measured(
  $: Test$,
  figures: {
    context?: { tokens?: number; window: number; percent?: number }
    rateLimits?: readonly { kind: string; percentUsed: number; resetsAt?: string }[]
    cost?: { usd: number }
  },
) {
  return $.session.measure({
    context: { tokens: 0, window: 200_000, percent: 0, ...figures.context },
    rateLimits: [...(figures.rateLimits ?? [])],
    cost: figures.cost,
    changed: ['context', 'cost', 'rateLimits'],
  })
}

async function todo(
  $: Test$,
  todos: readonly { content: string; status: TaskItem['status']; activeForm: string }[],
) {
  await $.tool.call({ tool: 'TodoWrite', todos: [...todos] })
}

function finished(turnId = 't1') {
  return { turnId, reason: 'answer' as const, answer: 'done', durationMs: 1000, isAborted: false }
}

/** Runs the mod's own slash command, as the person typing it would. */
function run($: Test$, args: string) {
  return $.command.run({
    command: 'plan-progress',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
}

/**
 * The pane, showing the tab asked for. It opens on the metrics — the numbers
 * are what the panel is for now — so the checklist is one press away.
 */
async function pane($: Test$, tab: 'goal' | 'metrics' = 'goal') {
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal' as const,
    component: 'Pane' as const,
    props: PANE_PROPS,
    requestId: PANE,
  })
  if (tab === 'goal') await ui.press({ key: 'tab-goal' })
  return ui
}

function band($: Test$, props: Partial<typeof BAND_PROPS> = {}, requestId = 'band') {
  return $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal' as const,
    component: 'AbovePrompt' as const,
    props: { ...BAND_PROPS, ...props },
    requestId,
    viewport: { columns: 160, rows: 40, isFullscreen: true },
  })
}

describe('the panel comes up with the session', () => {
  test('the band asks for the panel when it is not up yet', async ($, on) => {
    const { panes } = world($, on)
    await $.turn.start({ text: '/spec ask for it', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])

    const ui = await band($)
    await ui.unmount()
    expect(panes.has(PANE)).toBe(true)
  })

  test('it asks again while the pane is open, harmlessly', async ($, on) => {
    const { panes } = world($, on)
    await $.turn.start({ text: '/spec ask once', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])

    const first = await band($, {}, 'band-a')
    await first.unmount()
    expect(panes.has(PANE)).toBe(true)

    // An open id is only retitled, so asking again is not a second pane.
    const second = await band($, {}, 'band-b')
    await second.unmount()
    expect(panes.size).toBe(1)
  })

  test('it does not ask on a surface that places no panes', async ($, on) => {
    const { panes } = world($, on)
    await $.turn.start({ text: '/spec main screen', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal' as const,
      component: 'AbovePrompt' as const,
      props: BAND_PROPS,
      requestId: 'band-main',
      viewport: { columns: 100, rows: 40, isFullscreen: false },
    })
    await ui.unmount()
    expect(panes.has(PANE)).toBe(false)
  })

  test('the band still draws when the panel cannot be placed', async ($, on) => {
    world($, on, {}, false)
    await $.turn.start({ text: '/spec draw anyway', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])

    const ui = await band($)
    expect((await ui.find({ text: /draw anyway/ }))?.text).toContain('draw anyway')
    await ui.unmount()
  })
})

describe('the goal', () => {
  test('a /spec prompt opens a goal, and the pane draws it', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec let me pick a light or dark theme', turnId: 't1' })

    const ui = await pane($)
    expect((await ui.find({ text: /light or dark theme/ }))?.text).toContain(
      'light or dark theme',
    )
    expect((await ui.find({ text: /planning/ }))?.text).toContain('planning')
    await ui.unmount()
  })

  test('a plain prompt opens a goal too, and the pane draws it', async ($, on) => {
    world($, on)
    await $.turn.start({ text: 'add a --json flag to the cli', turnId: 't1' })

    const ui = await pane($)
    expect((await ui.find({ text: /add a --json flag/ }))?.text).toContain('add a --json flag')
    await ui.unmount()

    // A plain prompt that has not been broken down yet leaves the band alone.
    const strip = await band($)
    expect(JSON.stringify(await strip.drawn())).not.toContain('add a --json flag')
    await strip.unmount()
  })

  test('an explicit /goal draws the band before any checklist exists', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/goal make the panel honest', turnId: 't1' })

    const ui = await band($)
    expect((await ui.find({ text: /make the panel honest/ }))?.text).toContain(
      'make the panel honest',
    )
    await ui.unmount()
  })

  test('a bare slash command is not a goal', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/clear', turnId: 't1' })

    const ui = await pane($)
    expect((await ui.find({ text: /No goal is running/ }))?.text).toContain('No goal')
    await ui.unmount()
  })

  test('a working command like /commit opens a goal named after it', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/commit', turnId: 't1' })

    // It is a task with a beginning and an end, so the panel takes it up —
    // and the row comes with it, since the row is where `hide` lives.
    const ui = await pane($)
    expect((await ui.find({ text: /\/commit/ }))?.text).toContain('/commit')
    await ui.unmount()

    const strip = await band($)
    expect((await strip.find({ text: /\/commit/ }))?.text).toContain('/commit')
    await strip.unmount()
  })

  test('a commit run reads as building once it starts touching files', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/commit', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'git status' })
    for (const file_path of ['a.ts', 'b.ts', 'c.ts']) {
      await $.tool.call({ tool: 'Edit', file_path, old_string: 'x', new_string: 'y' })
    }

    const ui = await pane($)
    expect((await ui.find({ text: /building/ }))?.text).toContain('building')
    await ui.unmount()
  })

  test('/pr opens a goal of its own', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/pr', turnId: 't1' })

    const ui = await pane($)
    expect((await ui.find({ text: /\/pr/ }))?.text).toContain('/pr')
    // Composing a pull request reads and writes no code, so nothing moves it
    // off planning: that is the honest answer, not a wrong one.
    expect((await ui.find({ text: /planning/ }))?.text).toContain('planning')
    await ui.unmount()

    const strip = await band($)
    expect((await strip.find({ text: /\/pr/ }))?.text).toContain('/pr')
    await strip.unmount()
  })

  test('the elapsed time is frozen once every step is done', async ($, on) => {
    const { clock } = world($, on)
    await $.turn.start({ text: '/spec ship the parser', turnId: 't1' })
    await todo($, [
      { content: 'write it', status: 'completed', activeForm: 'writing it' },
      { content: 'test it', status: 'completed', activeForm: 'testing it' },
    ])
    await clock.advance(90_000)
    await $.turn.complete(finished())

    // Time moves on; the frozen figure does not.
    await clock.advance(600_000)
    const ui = await pane($)
    expect((await ui.find({ text: /complete/ }))?.text).toContain('complete')
    expect((await ui.find({ text: /1m 30s/ }))?.text).toContain('1m 30s')
    await ui.unmount()
  })
})

describe('the checklist', () => {
  test('a todo list becomes the checklist, and the bar counts it', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec add retries', turnId: 't1' })
    await todo($, [
      { content: 'read the client', status: 'completed', activeForm: 'reading the client' },
      { content: 'add backoff', status: 'in_progress', activeForm: 'adding backoff' },
      { content: 'cover it', status: 'pending', activeForm: 'covering it' },
    ])

    const ui = await pane($)
    expect(await ui.find({ text: /read the client/ })).toBeDefined()
    expect(await ui.find({ text: /cover it/ })).toBeDefined()
    expect((await ui.find({ text: /33%/ }))?.text).toContain('33%')
    expect((await ui.find({ text: /now: adding backoff/ }))?.text).toContain('now:')
    await ui.unmount()
  })

  test('a row keeps its place when the list is rewritten', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec keep the rows steady', turnId: 't1' })
    await todo($, [
      { content: 'a', status: 'completed', activeForm: 'doing a' },
      { content: 'b', status: 'in_progress', activeForm: 'doing b' },
      { content: 'c', status: 'pending', activeForm: 'doing c' },
    ])
    await todo($, [
      { content: 'a', status: 'completed', activeForm: 'doing a' },
      { content: 'b', status: 'completed', activeForm: 'doing b' },
      { content: 'c', status: 'pending', activeForm: 'doing c' },
    ])

    const ui = await pane($)
    expect((await ui.find({ text: /67%/ }))?.text).toContain('67%')
    expect((await ui.find({ text: /2\/3 steps/ }))?.text).toContain('2/3 steps')
    await ui.unmount()
  })

  test('the progress bar fills as steps complete', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec half done', turnId: 't1' })
    await todo($, [
      { content: 'a', status: 'completed', activeForm: 'doing a' },
      { content: 'b', status: 'completed', activeForm: 'doing b' },
      { content: 'c', status: 'pending', activeForm: 'doing c' },
      { content: 'd', status: 'pending', activeForm: 'doing d' },
    ])

    const ui = await pane($)
    const filled = await ui.find({ text: /█/ })
    expect(filled?.text).toContain('█')
    expect((await ui.find({ text: /50%/ }))?.text).toContain('50%')
    expect((await ui.find({ text: /2\/4 steps/ }))?.text).toContain('2/4 steps')
    await ui.unmount()
  })
})

describe('the phase', () => {
  test('reads as building while edits run, and as testing while checks run', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec change the config', turnId: 't1' })
    await todo($, [{ content: 'edit', status: 'in_progress', activeForm: 'editing' }])

    for (const file_path of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) {
      await $.tool.call({ tool: 'Edit', file_path, old_string: 'x', new_string: 'y' })
    }
    let ui = await pane($)
    expect((await ui.find({ text: /building/ }))?.text).toContain('building')
    await ui.unmount()

    for (let index = 0; index < 4; index += 1) {
      await $.tool.call({ tool: 'Bash', command: 'npm test' })
    }
    ui = await pane($)
    expect((await ui.find({ text: /testing/ }))?.text).toContain('testing')
    await ui.unmount()
  })

  test('reads as researching while reads and searches run', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec find the bug', turnId: 't1' })
    await todo($, [{ content: 'look', status: 'in_progress', activeForm: 'looking' }])
    for (const file_path of ['a.ts', 'b.ts', 'c.ts', 'd.ts']) {
      await $.tool.call({ tool: 'Read', file_path })
    }

    const ui = await pane($)
    expect((await ui.find({ text: /researching/ }))?.text).toContain('researching')
    await ui.unmount()
  })

  test('reads as auditing when a review skill runs', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec check the diff', turnId: 't1' })
    await todo($, [{ content: 'review', status: 'in_progress', activeForm: 'reviewing' }])
    await $.tool.call({ tool: 'Skill', skill: 'code-review' })

    const ui = await pane($)
    expect((await ui.find({ text: /auditing/ }))?.text).toContain('auditing')
    await ui.unmount()
  })
})

describe('the skill and the agent at work', () => {
  test('a skill is pinned to the step it runs on', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec document it', turnId: 't1' })
    await todo($, [
      { content: 'write it', status: 'completed', activeForm: 'writing it' },
      { content: 'document it', status: 'in_progress', activeForm: 'documenting it' },
    ])
    await $.tool.call({ tool: 'Skill', skill: 'doc' })

    const ui = await pane($)
    expect((await ui.find({ text: /@doc/ }))?.text).toContain('@doc')
    expect((await ui.find({ text: /skill doc/ }))?.text).toContain('skill doc')
    await ui.unmount()
  })

  test('an agent type is pinned to the step it runs on', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec delegate this', turnId: 't1' })
    await todo($, [{ content: 'sweep', status: 'in_progress', activeForm: 'sweeping' }])
    await $.tool.call({ tool: 'Agent', description: 'sweep', prompt: 'go', subagent_type: 'Explore' })

    const ui = await pane($)
    expect((await ui.find({ text: /◇Explore/ }))?.text).toContain('◇Explore')
    expect((await ui.find({ text: /agent Explore/ }))?.text).toContain('agent Explore')
    await ui.unmount()
  })
})

describe('the metrics', () => {
  test("a turn's usage and the session's own figures reach the pane", async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec watch the spend', turnId: 't1' })
    await $.turn.complete({
      ...finished(),
      usage: {
        input_tokens: 120_000,
        output_tokens: 9_000,
        cache_read_input_tokens: 400_000,
        cache_creation_input_tokens: 30_000,
        model: 'claude-sonnet-5-5',
      },
    })
    await measured($, {
      context: { tokens: 87_000, window: 128_000, percent: 68 },
      cost: { usd: 0.83 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 82 }],
    })

    const ui = await pane($, 'metrics')
    expect((await ui.find({ text: /120k/ }))?.text).toContain('120k')
    expect((await ui.find({ text: /9\.0k/ }))?.text).toContain('9.0k')
    expect((await ui.find({ text: /430k/ }))?.text).toContain('430k')
    expect((await ui.find({ text: /0\.83/ }))?.text).toContain('0.83')
    // The context window and the rate-limit window are the engine's figures.
    expect((await ui.find({ text: /68%/ }))?.text).toContain('68%')
    expect((await ui.find({ text: /87\.0k \/ 128k/ }))?.text).toContain('/ 128k')
    expect((await ui.find({ text: /82%/ }))?.text).toContain('82%')
    await ui.unmount()
  })

  test('the clock splits the run across the phases it saw', async ($, on) => {
    const { clock } = world($, on)
    await $.session.start({
      cwd: '/home/sam/projects/demo',
      surface: 'terminal',
      isInteractive: true,
    })
    // `/spec` opens the goal in planning, and the clock starts on it there.
    await $.turn.start({ text: '/spec watch the clock', turnId: 't1' })
    await todo($, [{ content: 'edit', status: 'in_progress', activeForm: 'editing' }])
    await clock.advance(10_000)
    // A run of edits moves the phase to building, and banking as each lands
    // credits planning with the ten seconds it actually held. One edit would
    // not be enough: `/spec` seeded the window with planning.
    for (const file_path of ['a.ts', 'b.ts', 'c.ts']) {
      await $.tool.call({ tool: 'Edit', file_path, old_string: 'x', new_string: 'y' })
    }

    const ui = await pane($, 'metrics')
    const planning = await ui.find({ text: /planning/ })
    expect(planning?.text).toContain('planning')
    expect(planning?.text).toContain('10s')
    // Building is where the work is now, so its row is up from the first
    // second — before it has had time to earn any.
    expect((await ui.find({ text: /building/ }))?.text).toContain('building')
    await ui.unmount()
  })

  test('a failing check and a failed call both show in the health line', async ($, on) => {
    const { toolFailures } = world($, on)
    await $.turn.start({ text: '/spec run the checks', turnId: 't1' })
    toolFailures.value = true
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'x', new_string: 'y' })
    toolFailures.value = false

    const ui = await pane($, 'metrics')
    expect((await ui.find({ text: /1 check, 1 failed/ }))?.text).toContain('1 failed')
    expect((await ui.find({ text: /2 failed calls/ }))?.text).toContain('2 failed calls')
    await ui.unmount()
  })

  test('a file edited over and over reads as churn', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec keep at it', turnId: 't1' })
    for (let i = 0; i < 4; i += 1) {
      await $.tool.call({ tool: 'Edit', file_path: 'src/loop.ts', old_string: 'x', new_string: 'y' })
    }

    const ui = await pane($, 'metrics')
    expect((await ui.find({ text: /loop\.ts ×4/ }))?.text).toContain('loop.ts ×4')
    await ui.unmount()
  })

  test('clear forgets the figures as well as the goal', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec spend something', turnId: 't1' })
    await $.turn.complete({
      ...finished(),
      usage: {
        input_tokens: 120_000,
        output_tokens: 9_000,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        model: 'claude-sonnet-5-5',
      },
    })

    const before = await pane($, 'metrics')
    expect((await before.find({ text: /120k/ }))?.text).toContain('120k')
    await before.unmount()

    await run($, 'clear')
    const after = await pane($, 'metrics')
    expect(await after.find({ text: /120k/ })).toBeUndefined()
    expect((await after.find({ text: /Nothing measured yet/ }))?.text).toContain(
      'Nothing measured yet',
    )
    await after.unmount()
  })

  test('a scrolled pane says which rows it is showing', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec scroll me', turnId: 't1' })
    await todo($, [
      { content: 'one', status: 'completed', activeForm: 'doing one' },
      { content: 'two', status: 'pending', activeForm: 'doing two' },
      { content: 'three', status: 'pending', activeForm: 'doing three' },
    ])

    const ui = await $.ui.mount({
      plugin: PLUGIN,
      surface: 'terminal' as const,
      component: 'Pane' as const,
      props: { ...PANE_PROPS, scroll: { offset: 1, bodyRows: 2 } },
      requestId: PANE,
    })
    await ui.press({ key: 'tab-goal' })
    expect((await ui.find({ text: /↕ 2–3 of 3/ }))?.text).toContain('↕ 2–3 of 3')
    await ui.unmount()
  })
})

describe('the command', () => {
  test('opens the pane', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec something to show', turnId: 't1' })

    const opened = await run($, '')
    expect(opened.text).toContain('Plan Progress')
    expect(opened.text).toContain('metrics are open')

    const ui = await pane($)
    expect((await ui.find({ text: /something to show/ }))?.text).toContain('something to show')
    await ui.unmount()
  })

  test('a bare command opens the metrics, and goal switches to the checklist', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec something to show', turnId: 't1' })
    await todo($, [{ content: 'a step', status: 'pending', activeForm: 'doing a step' }])

    // No argument: the numbers, which is what the panel is for now.
    expect((await run($, '')).text).toContain('metrics are open')
    const metrics = await pane($, 'metrics')
    expect((await metrics.find({ text: /Tokens/ }))?.text).toContain('Tokens')
    await metrics.unmount()

    // `goal` puts the checklist up instead.
    expect((await run($, 'goal')).text).toContain('checklist is open')
    const checklist = await pane($, 'goal')
    expect((await checklist.find({ text: /a step/ }))?.text).toContain('a step')
    await checklist.unmount()
  })

  test('says so when there is nothing to show yet', async ($, on) => {
    world($, on)
    // The metrics open regardless — there are figures even with no goal — and
    // say what they are waiting for.
    expect((await run($, '')).text).toContain('metrics are open')
    // The checklist has nothing to draw, and says so plainly.
    expect((await run($, 'goal')).text).toContain('no goal is running')
  })

  test('says so when the terminal is too narrow for a pane', async ($, on) => {
    // A surface that cannot place the pane, so `$.ui.open` comes back refused.
    world($, on, false)
    await $.turn.start({ text: '/spec too narrow', turnId: 't1' })
    const opened = await run($, '')
    expect(opened.text).toContain('widen the terminal')
  })

  test('hide takes the panel and the row away; show brings both back', async ($, on) => {
    const { panes } = world($, on)
    await $.turn.start({ text: '/spec gone in a moment', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])
    panes.add(PANE)

    expect((await run($, 'hide')).text).toContain('hidden')
    expect(panes.has(PANE)).toBe(false)

    const hidden = await band($)
    expect(JSON.stringify(await hidden.drawn())).not.toContain('gone in a moment')
    await hidden.unmount()

    expect((await run($, 'show')).text).toContain('shown')
    expect(panes.has(PANE)).toBe(true)

    const shown = await band($, {}, 'band-again')
    expect((await shown.find({ text: /gone in a moment/ }))?.text).toContain('gone in a moment')
    await shown.unmount()
  })

  test('the panel comes back by itself after the person closes it', async ($, on) => {
    const { clock, panes } = world($, on)
    await $.turn.start({ text: '/spec outlive a close', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])

    panes.add(PANE)
    const ui = await band($)
    await ui.unmount()
    expect(panes.has(PANE)).toBe(true)

    // The engine's close mark: the pane must not stay closed for good. The
    // band asks again, but no more often than the retry window allows.
    panes.delete(PANE)
    await clock.advance(11_000)
    const again = await band($, {}, 'band-after-close')
    await again.unmount()
    expect(panes.has(PANE)).toBe(true)
  })

  test('what is hidden still carries the control that brings it back', async ($, on) => {
    const { panes } = world($, on)
    await $.turn.start({ text: '/spec never lose the way back', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])

    expect((await run($, 'hide')).text).toContain('hidden')
    expect(panes.has(PANE)).toBe(false)

    // The row is still there, short, and its button is the way back: hiding
    // must never take away the only control that could undo it.
    const hidden = await band($)
    expect((await hidden.find({ key: 'panel' }))?.text).toContain('show')
    await hidden.press({ key: 'panel' })
    await hidden.unmount()

    expect(panes.has(PANE)).toBe(true)
    const back = await band($, {}, 'band-restored')
    expect((await back.find({ text: /never lose the way back/ }))?.text).toContain(
      'never lose the way back',
    )
    await back.unmount()
  })

  test('clear forgets the goal', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec forget this', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])

    expect((await run($, 'clear')).text).toContain(
      'cleared',
    )
    const ui = await pane($)
    expect((await ui.find({ text: /No goal is running/ }))?.text).toContain('No goal')
    await ui.unmount()
  })

  test('a step shows how long it took', async ($, on) => {
    const { clock } = world($, on)
    await $.turn.start({ text: '/spec time each step', turnId: 't1' })
    await todo($, [
      { content: 'the first step', status: 'in_progress', activeForm: 'doing the first step' },
      { content: 'the second step', status: 'pending', activeForm: 'doing the second' },
    ])
    await clock.advance(12_000)
    // A tool call banks the seconds against the step that is in progress.
    await $.tool.call({ tool: 'Read', file_path: 'a.ts' })

    const ui = await pane($, 'goal')
    // `find` answers with the text of the whole tree, so the assertion is on
    // what follows each step: the one worked on carries a time, the other none.
    const drawn = (await ui.find({ text: /the first step/ }))?.text ?? ''
    expect(drawn).toContain('the first step')
    expect(drawn).toMatch(/the first step\s+12s/)
    expect(drawn).not.toMatch(/the second step\s+\d/)
    await ui.unmount()
  })

  test('copy says so when the surface has no clipboard', async ($, on) => {
    const { copyFails } = world($, on)
    await $.turn.start({ text: '/spec nothing to copy into', turnId: 't1' })
    copyFails.value = true
    expect((await run($, 'copy')).text).toContain('nothing to copy into')
  })

  test('copy puts a summary on the clipboard', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec say what happened', turnId: 't1' })
    await measured($, {
      context: { tokens: 87_000, window: 128_000, percent: 68 },
      cost: { usd: 0.83 },
    })
    const result = await run($, 'copy')
    expect(result.text).toContain('clipboard')
  })
})

describe('the band above the prompt', () => {
  test('draws the goal, the bar and the percentage while one runs', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec a band worth drawing', turnId: 't1' })
    await todo($, [
      { content: 'a', status: 'completed', activeForm: 'doing a' },
      { content: 'b', status: 'in_progress', activeForm: 'doing b' },
    ])

    const ui = await band($)
    expect((await ui.find({ text: /a band worth drawing/ }))?.text).toContain(
      'a band worth drawing',
    )
    expect((await ui.find({ text: /50%/ }))?.text).toContain('50%')
    expect((await ui.find({ key: 'panel' }))?.type).toBe('Button')
    await ui.unmount()
  })

  test('yields the band to a survey', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec quiet now', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'pending', activeForm: 'doing a' }])

    const ui = await band($, { hasSurvey: true }, 'band-survey')
    expect(JSON.stringify(await ui.drawn())).not.toContain('quiet now')
    await ui.unmount()
  })

  test('the hidden row carries the figures, until band off takes them away', async ($, on) => {
    world($, on)
    await $.turn.start({ text: '/spec out of sight', turnId: 't1' })
    await todo($, [{ content: 'a', status: 'in_progress', activeForm: 'doing a' }])
    await measured($, {
      context: { tokens: 87_000, window: 128_000, percent: 68 },
      cost: { usd: 0.83 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 82 }],
    })
    await run($, 'hide')

    // With the panel gone the figures come to the row, where they still show.
    let ui = await band($, {}, 'band-hidden')
    expect((await ui.find({ text: /ctx/ }))?.text).toContain('68')
    expect((await ui.find({ text: /↑/ }))?.text).toContain('$0.83')
    expect((await ui.find({ text: /5h/ }))?.text).toContain('82')
    await ui.unmount()

    // `band off` leaves the row the goal alone, as it was.
    expect((await run($, 'band off')).text).toContain('goal alone')
    ui = await band($, {}, 'band-hidden-plain')
    expect(await ui.find({ text: /ctx/ })).toBeUndefined()
    expect((await ui.find({ key: 'panel' }))?.type).toBe('Button')
    await ui.unmount()
  })
})
