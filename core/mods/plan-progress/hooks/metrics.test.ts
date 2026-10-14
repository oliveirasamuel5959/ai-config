import { describe, expect, test } from 'claude-code/testing'

import {
  TURN_RING,
  accrueTime,
  addTurn,
  bucketOf,
  churn,
  countTurn,
  EDIT_TRACK,
  emptyMetrics,
  formatClock,
  formatCost,
  formatTokens,
  isCheck,
  levelOf,
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

const USAGE = {
  input_tokens: 1000,
  output_tokens: 250,
  cache_read_input_tokens: 4000,
  cache_creation_input_tokens: 500,
}

describe('a fresh start', () => {
  test('nothing spent, nothing done', () => {
    const m = emptyMetrics()
    expect(m.turns).toBe(0)
    expect(m.tools).toBe(0)
    expect(m.tokens.input).toBe(0)
    expect(m.costUsd).toBe(0)
    expect(m.phaseMs).toEqual({})
    expect(m.turnDurations).toEqual([])
  })

  test('a new goal restarts the goal figures but keeps the session ones', () => {
    // Tokens, context and cost are the engine's figures for the whole session,
    // so starting them over would put the panel at odds with /cost.
    const spent = {
      ...emptyMetrics(),
      turns: 9,
      tools: 40,
      checks: { runs: 3, failed: 1 },
      tokens: { input: 5000, output: 900, cacheRead: 0, cacheWrite: 0 },
      context: { tokens: 8000, window: 200_000, percent: 4 },
      costUsd: 1.25,
      rateLimits: [{ kind: 'five_hour', percentUsed: 12 }],
    }
    const m = restartMetrics(spent)
    expect(m.turns).toBe(0)
    expect(m.tools).toBe(0)
    expect(m.checks).toEqual({ runs: 0, failed: 0 })
    expect(m.tokens).toEqual(spent.tokens)
    expect(m.context).toEqual(spent.context)
    expect(m.costUsd).toBe(1.25)
    expect(m.rateLimits).toEqual(spent.rateLimits)
  })
})

describe('counting turns', () => {
  test('a subagent turn is counted apart from the main thread', () => {
    let m = emptyMetrics()
    m = countTurn(m, false)
    m = countTurn(m, false)
    m = countTurn(m, true)
    expect(m.turns).toBe(2)
    expect(m.subagentTurns).toBe(1)
  })

  test('a subagent turn spends but does not join the series', () => {
    // The series is drawn beside the main-thread turn count, so a subagent
    // turn in it would make the number and the picture disagree. Its spend is
    // still real money, so the tokens count.
    let m = addTurn(emptyMetrics(), {
      usage: USAGE,
      durationMs: 500,
      isAborted: false,
      reason: 'answer',
      isSubagent: true,
    })
    expect(m.turnDurations).toEqual([])
    expect(m.turnTokens).toEqual([])
    expect(m.tokens.input).toBe(1000)
  })

  test("a turn's usage adds to the session totals", () => {
    let m = countTurn(emptyMetrics(), false)
    m = addTurn(m, { usage: USAGE, durationMs: 1200, isAborted: false, reason: 'answer' })
    m = addTurn(m, { usage: USAGE, durationMs: 800, isAborted: false, reason: 'answer' })
    expect(m.tokens.input).toBe(2000)
    expect(m.tokens.output).toBe(500)
    expect(m.tokens.cacheRead).toBe(8000)
    expect(m.tokens.cacheWrite).toBe(1000)
    expect(m.turnDurations).toEqual([1200, 800])
  })

  test('a turn that reported no usage still takes its place in the series', () => {
    // The rings must stay aligned with the turns, even when the engine had no
    // figures to give, or the sparkline lies about which turn was the big one.
    let m = addTurn(emptyMetrics(), {
      usage: undefined,
      durationMs: 300,
      isAborted: false,
      reason: 'answer',
    })
    expect(m.turnDurations).toEqual([300])
    expect(m.turnTokens).toEqual([0])
    expect(m.tokens.output).toBe(0)
  })

  test('errors and aborts are counted', () => {
    let m = addTurn(emptyMetrics(), {
      usage: USAGE,
      durationMs: 10,
      isAborted: false,
      reason: 'error',
    })
    m = addTurn(m, { usage: USAGE, durationMs: 10, isAborted: true, reason: 'aborted' })
    expect(m.erroredTurns).toBe(1)
    expect(m.abortedTurns).toBe(1)
  })

  test('the series is bounded, newest kept', () => {
    let m = emptyMetrics()
    for (let i = 1; i <= TURN_RING + 8; i += 1) {
      m = addTurn(m, {
        usage: USAGE,
        durationMs: i,
        isAborted: false,
        reason: 'answer',
      })
    }
    expect(m.turnDurations).toHaveLength(TURN_RING)
    expect(m.turnDurations[TURN_RING - 1]).toBe(TURN_RING + 8)
    expect(m.turnDurations[0]).toBe(9)
  })
})

describe('where the time went', () => {
  test('a phase that turns over banks the time it held', () => {
    // Opens at 0 as building, so the twelve seconds to 12_000 are building's.
    let m = accrueTime(emptyMetrics(), 0, 'building', null)
    m = accrueTime(m, 12_000, 'testing', null)
    expect(m.phaseMs.building).toBe(12_000)
    expect(m.openPhase).toBe('testing')
  })

  test('the phase in progress counts up live, without being banked first', () => {
    let m = accrueTime(emptyMetrics(), 0, 'building', null)
    m = accrueTime(m, 12_000, 'testing', null)
    expect(phaseTime(m, 'testing', 17_000)).toBe(5000)
    expect(phaseTime(m, 'building', 17_000)).toBe(12_000)
    expect(phaseTime(m, 'auditing', 17_000)).toBe(0)
  })

  test('a phase that flips away and back accumulates rather than restarting', () => {
    let m = accrueTime(emptyMetrics(), 0, 'building', null)
    m = accrueTime(m, 10_000, 'researching', null)
    m = accrueTime(m, 15_000, 'building', null)
    expect(m.phaseMs.building).toBe(10_000)
    expect(m.phaseMs.researching).toBe(5000)
    // The second building stretch runs on from 15_000.
    expect(phaseTime(m, 'building', 20_000)).toBe(15_000)
  })

  test('the phase and the step are banked as two independent intervals', () => {
    // The step turns over while the phase stands, and neither loses its clock.
    let m = accrueTime(emptyMetrics(), 0, 'building', 'a')
    m = accrueTime(m, 4000, 'building', 'b')
    expect(m.phaseMs.building).toBeUndefined()
    expect(phaseTime(m, 'building', 6000)).toBe(6000)
    expect(m.taskMs.a).toBe(4000)
    expect(taskTime(m, 'b', 6000)).toBe(2000)
  })

  test('an idle second is a step and a phase with no clock running', () => {
    let m = accrueTime(emptyMetrics(), 0, 'building', 'a')
    m = accrueTime(m, 4000, 'building', null)
    expect(m.taskMs.a).toBe(4000)
    expect(taskTime(m, 'a', 9000)).toBe(4000)
  })

  test('a tick that changes nothing writes nothing', () => {
    const m = accrueTime(emptyMetrics(), 0, 'building', 'a')
    expect(accrueTime(m, 1000, 'building', 'a')).toBe(m)
  })
})

describe('counting tools', () => {
  test('each tool falls in its own bucket', () => {
    expect(bucketOf('Read', {})).toBe('read')
    expect(bucketOf('Grep', {})).toBe('search')
    expect(bucketOf('Edit', { file_path: 'a.ts' })).toBe('edit')
    expect(bucketOf('Write', { file_path: 'a.ts' })).toBe('edit')
    expect(bucketOf('Bash', { command: 'ls -la' })).toBe('shell')
    expect(bucketOf('Bash', { command: 'npm test' })).toBe('check')
    expect(bucketOf('TodoWrite', {})).toBe('task')
    expect(bucketOf('Skill', {})).toBe('skill')
    expect(bucketOf('Agent', {})).toBe('agent')
    expect(bucketOf('SomethingNew', {})).toBe('other')
  })

  test('only a shell call that runs a check is a check', () => {
    expect(isCheck('Bash', { command: 'pytest -q' })).toBe(true)
    expect(isCheck('Bash', { command: 'git status' })).toBe(false)
    // A read tool is never a check, whatever its arguments say.
    expect(isCheck('Read', { command: 'npm test' })).toBe(false)
  })

  test('a call is counted, bucketed, and its failure recorded', () => {
    let m = noteTool(emptyMetrics(), 'Edit', { file_path: 'a.ts' }, false, 100)
    m = noteTool(m, 'Edit', { file_path: 'a.ts' }, true, 200)
    expect(m.tools).toBe(2)
    expect(m.toolsByBucket.edit).toBe(2)
    expect(m.failedTools).toBe(1)
    expect(m.lastToolAt).toBe(200)
    expect(m.lastToolName).toBe('Edit')
    expect(m.editCounts['a.ts']).toBe(2)
  })

  test('a failing check is counted as a run and as a failure', () => {
    let m = noteTool(emptyMetrics(), 'Bash', { command: 'npm test' }, false, 1)
    m = noteTool(m, 'Bash', { command: 'npm test' }, true, 2)
    m = noteTool(m, 'Bash', { command: 'ls' }, false, 3)
    expect(m.checks).toEqual({ runs: 2, failed: 1 })
  })

  test('only a file an editing call names is tracked', () => {
    let m = noteTool(emptyMetrics(), 'Read', { file_path: 'a.ts' }, false, 1)
    expect(m.editCounts).toEqual({})
    m = noteTool(m, 'Write', { file_path: 'b.ts' }, false, 2)
    expect(m.editCounts).toEqual({ 'b.ts': 1 })
  })

  test('skills and agents are named and counted', () => {
    let m = noteName(emptyMetrics(), 'skills', 'spec-kit')
    m = noteName(m, 'skills', 'spec-kit')
    m = noteName(m, 'agents', 'Explore')
    expect(m.skills['spec-kit']).toBe(2)
    expect(m.agents.Explore).toBe(1)
  })
})

describe('churn', () => {
  test('only a file edited repeatedly reads as churn, worst first', () => {
    const edits = { 'a.ts': 5, 'b.ts': 3, 'c.ts': 1, 'd.ts': 4 }
    expect(churn(edits)).toEqual([
      { path: 'a.ts', count: 5 },
      { path: 'd.ts', count: 4 },
      { path: 'b.ts', count: 3 },
    ])
  })

  test('is capped, and empty when nothing repeats', () => {
    const many = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`f${i}.ts`, 9]),
    )
    expect(churn(many).length).toBeLessThanOrEqual(6)
    expect(churn({ 'a.ts': 1, 'b.ts': 2 })).toEqual([])
  })
  test('the churn map is capped, keeping the hottest files', () => {
    // A session that touches thousands of files must not grow this map without
    // end; past the cap the least-edited goes, since churn would never name it.
    let m = emptyMetrics()
    for (let i = 0; i < EDIT_TRACK + 40; i += 1) {
      m = noteTool(m, 'Edit', { file_path: `f${i}.ts` }, false, i)
    }
    expect(Object.keys(m.editCounts).length).toBeLessThanOrEqual(EDIT_TRACK)
    // A file edited again and again is never the least-edited, so it survives.
    for (let i = 0; i < 5; i += 1) {
      m = noteTool(m, 'Edit', { file_path: 'hot.ts' }, false, 1000 + i)
    }
    for (let i = 0; i < 60; i += 1) {
      m = noteTool(m, 'Edit', { file_path: `later${i}.ts` }, false, 2000 + i)
    }
    expect(m.editCounts['hot.ts']).toBe(5)
    expect(churn(m.editCounts)[0]).toEqual({ path: 'hot.ts', count: 5 })
  })
})

describe('reading the names that were used', () => {
  test('most used first, and capped', () => {
    expect(topNames({ spec: 4, verify: 2, doc: 9, review: 1 }, 2)).toEqual(['doc 9', 'spec 4'])
  })
})

describe('how a figure is doing', () => {
  test('the panel has its own thresholds', () => {
    expect(levelOf(0)).toBe('calm')
    expect(levelOf(74)).toBe('calm')
    expect(levelOf(75)).toBe('warning')
    expect(levelOf(89)).toBe('warning')
    expect(levelOf(90)).toBe('error')
    expect(levelOf(100)).toBe('error')
  })
})

describe('the figures as the panel writes them', () => {
  test('a token count reads short', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(842)).toBe('842')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1000)).toBe('1.0k')
    expect(formatTokens(12_400)).toBe('12.4k')
    expect(formatTokens(99_994)).toBe('100k')
    expect(formatTokens(999_999)).toBe('1000k')
    expect(formatTokens(1_200_000)).toBe('1.2M')
  })

  test('a count that is not a number reads as nothing spent', () => {
    expect(formatTokens(Number.NaN)).toBe('0')
    expect(formatTokens(-50)).toBe('0')
  })

  test('dollars keep their cents until they stop mattering', () => {
    expect(formatCost(0)).toBe('$0.00')
    expect(formatCost(0.834)).toBe('$0.83')
    expect(formatCost(99.99)).toBe('$99.99')
    expect(formatCost(120.4)).toBe('$120')
  })

  test('a reset stamp reads as a time of day', () => {
    // 14:20 local, whatever the zone: build it from the local parts.
    const at = new Date(2026, 0, 1, 14, 20, 0).getTime()
    expect(formatClock(at)).toBe('14:20')
  })

  test('a countdown to a reset, and nothing when the engine gave none', () => {
    const now = new Date(2026, 0, 1, 14, 0, 0).getTime()
    const at = new Date(2026, 0, 1, 14, 42, 0).getTime()
    expect(remainingTo(new Date(at).toISOString(), now)).toBe(42 * 60 * 1000)
    expect(remainingTo(undefined, now)).toBeNull()
    expect(remainingTo('not a date', now)).toBeNull()
  })
})

describe('the summary for the clipboard', () => {
  test('reads whole away from the terminal', () => {
    let m = addTurn(emptyMetrics(), {
      usage: USAGE,
      durationMs: 1000,
      isAborted: false,
      reason: 'answer',
    })
    m = noteTool(m, 'Bash', { command: 'npm test' }, false, 1)
    m = noteTool(m, 'Edit', { file_path: 'a.ts' }, false, 2)
    m = noteName(m, 'skills', 'spec-kit')
    m = { ...m, context: { tokens: 87_000, window: 128_000, percent: 68 }, costUsd: 0.83 }

    const text = summaryText({
      goal: 'add retries',
      phase: 'building',
      done: 2,
      total: 5,
      elapsedMs: 724_000,
      metrics: m,
    })
    const lines = text.split('\n')
    expect(lines[0]).toBe('plan-progress — add retries')
    expect(lines[1]).toContain('phase building')
    expect(lines[1]).toContain('2/5 steps')
    expect(lines[1]).toContain('12m 04s')
    expect(lines[2]).toContain('in 1.0k')
    expect(lines[2]).toContain('$0.83')
    expect(lines[2]).toContain('ctx 68%')
    expect(lines[3]).toContain('tools 2')
    // Most used bucket first, so the line reads as a ranking.
    expect(lines[3]).toContain('check 1, edit 1')
    expect(lines[4]).toContain('spec-kit 1')
    expect(text).toContain('health 1 checks, 0 failed')
  })

  test('says so plainly when there is no goal yet', () => {
    const text = summaryText({
      goal: null,
      phase: 'planning',
      done: 0,
      total: 0,
      elapsedMs: 0,
      metrics: emptyMetrics(),
    })
    expect(text).toContain('plan-progress — (no goal)')
    expect(text).toContain('tools 0 (none)')
    // No skills, agents or churn, so those lines are left out rather than
    // printed empty.
    expect(text).not.toContain('skills')
    expect(text).not.toContain('churn')
  })
})

describe('a series as a row of blocks', () => {  test('nothing to show draws nothing', () => {
    expect(sparkline([], 10)).toBe('')
  })

  test('a flat series keeps its row rather than vanishing', () => {
    expect(sparkline([0, 0, 0], 10)).toBe('▁▁▁')
  })

  test('the peak gets the tallest block and the shape is relative to it', () => {
    // Scaled against the peak, not stretched between the lowest and highest, so
    // a quarter of the peak sits mid-height rather than at the floor: the row
    // reads as a magnitude, not just a rank.
    expect(sparkline([1, 2, 4], 10)).toBe('▃▅█')
  })

  test('only the newest entries fit the width, scaled to their own peak', () => {
    // The last three of [9, 9, 9, 1, 2] are [9, 1, 2], and 9 is their peak.
    expect(sparkline([9, 9, 9, 1, 2], 3)).toBe('█▂▃')
  })
})
