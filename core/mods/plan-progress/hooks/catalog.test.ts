import { describe, expect, test } from 'claude-code/testing'

import {
  SCOPE_ORDER,
  catalogFrom,
  catalogRows,
  countsOf,
  emptyCatalog,
  groupLabel,
  nameWidth,
  padTo,
  scopeOf,
} from './catalog'
import { displayWidth } from './progress'

describe('where a listing came from', () => {
  test("each of the engine's words maps to the scope the panel shows", () => {
    expect(scopeOf('projectSettings')).toBe('project')
    expect(scopeOf('userSettings')).toBe('user')
    expect(scopeOf('plugin')).toBe('plugin')
    expect(scopeOf('policySettings')).toBe('policy')
    expect(scopeOf('built-in')).toBe('builtin')
    expect(scopeOf('mcp')).toBe('mcp')
  })

  test('a word this mod does not know is kept, not dropped', () => {
    // `syncedSkills` is in the engine's vocabulary and not in this mod's: a
    // name the panel cannot place is still a name the session can use, so it
    // lands in `other` rather than vanishing from the listing.
    expect(scopeOf('syncedSkills')).toBe('other')
    expect(scopeOf('something-added-next-year')).toBe('other')
  })

  test('a scope labels itself', () => {
    expect(groupLabel('project')).toBe('project')
    expect(groupLabel('other')).toBe('other')
  })
})

describe('folding the engine listing into a catalog', () => {
  test('skills and agents are read with their scopes', () => {
    const catalog = catalogFrom(
      {
        skills: {
          skillFrontmatter: [
            { name: 'spec-kit', source: 'projectSettings' },
            { name: 'doc', source: 'userSettings' },
          ],
        },
        agents: [{ agentType: 'planner', source: 'projectSettings' }],
      },
      1000,
    )
    expect(catalog.skills).toEqual([
      { name: 'spec-kit', scope: 'project' },
      { name: 'doc', scope: 'user' },
    ])
    expect(catalog.agents).toEqual([{ name: 'planner', scope: 'project' }])
    expect(catalog.readAt).toBe(1000)
    expect(catalog.isRead).toBe(true)
  })

  test('an absent breakdown is unread, not empty', () => {
    // Nothing was asked, or there is no session bound. The panel draws the
    // same empty table either way, but it says a different thing about it.
    const catalog = catalogFrom(undefined, 1000)
    expect(catalog).toEqual(emptyCatalog())
    expect(catalog.isRead).toBe(false)
  })

  test('a breakdown without a skills listing is read, and says so', () => {
    // The engine omits `skills` when the session lists none, unlike `agents`,
    // which is always present. That is an answer, so it reads as one.
    const catalog = catalogFrom({ agents: [] }, 1000)
    expect(catalog.skills).toEqual([])
    expect(catalog.isRead).toBe(true)
  })

  test('a breakdown missing the skills key inside it does not throw', () => {
    const catalog = catalogFrom({ skills: {}, agents: undefined }, 5)
    expect(catalog.skills).toEqual([])
    expect(catalog.agents).toEqual([])
    expect(catalog.isRead).toBe(true)
  })
})

describe('the rows of a listing', () => {
  const catalog = catalogFrom(
    {
      skills: {
        skillFrontmatter: [
          { name: 'doc', source: 'userSettings' },
          { name: 'spec-kit', source: 'projectSettings' },
          { name: 'verify', source: 'projectSettings' },
          { name: 'code-review', source: 'plugin' },
        ],
      },
    },
    0,
  )

  test('scope first, then name — so a scope never interleaves', () => {
    const rows = catalogRows(catalog, 'skills', {})
    expect(rows.map(row => `${row.scope}:${row.name}`)).toEqual([
      'project:spec-kit',
      'project:verify',
      'user:doc',
      'plugin:code-review',
    ])
  })

  test('the first row of each scope is marked, so the label prints once', () => {
    const rows = catalogRows(catalog, 'skills', {})
    expect(rows.map(row => row.isGroupStart)).toEqual([true, false, true, true])
  })

  test('a count folds onto the entry it names', () => {
    const rows = catalogRows(catalog, 'skills', { 'spec-kit': 2, verify: 1 })
    const spec = rows.find(row => row.name === 'spec-kit')
    const doc = rows.find(row => row.name === 'doc')
    expect(spec?.used).toBe(2)
    expect(spec?.scope).toBe('project')
    // Available but never used: still listed, at zero.
    expect(doc?.used).toBe(0)
  })

  test('a used name the engine does not list is kept, under other', () => {
    // Happens when the listing is trimmed to the context's budget. A skill the
    // panel watched run should not vanish from the panel's own catalog.
    const rows = catalogRows(catalog, 'skills', { 'trimmed-away': 3 })
    const orphan = rows.find(row => row.name === 'trimmed-away')
    expect(orphan?.used).toBe(3)
    expect(orphan?.scope).toBe('other')
    // And `other` sorts last, after every scope the engine named.
    expect(rows[rows.length - 1]?.name).toBe('trimmed-away')
  })

  test('an empty listing draws no rows', () => {
    expect(catalogRows(emptyCatalog(), 'skills', {})).toEqual([])
  })

  test('the header counts what is available and what ran', () => {
    const rows = catalogRows(catalog, 'skills', { 'spec-kit': 2, 'code-review': 1 })
    expect(countsOf(rows)).toEqual({ available: 4, used: 2 })
  })

  test('nothing used counts as nothing used', () => {
    expect(countsOf(catalogRows(catalog, 'skills', {}))).toEqual({ available: 4, used: 0 })
  })
})

describe('padding a column by cells, not code points', () => {
  test('a narrow name is padded to the column', () => {
    expect(padTo('doc', 8)).toBe('doc     ')
    expect(displayWidth(padTo('doc', 8))).toBe(8)
  })

  test('a wide name is padded by cells, so the next column still lines up', () => {
    // Four ideographs is eight cells: at ten only two spaces follow, where
    // counting code points would have added six and pushed the column out.
    expect(padTo('构建一个', 10)).toBe('构建一个  ')
    expect(displayWidth(padTo('构建一个', 10))).toBe(10)
    expect(displayWidth(padTo('构建一个', 10))).toBe(displayWidth(padTo('abcdefgh', 10)))
  })

  test('a name already at or past the column is left alone', () => {
    expect(padTo('a-long-name', 4)).toBe('a-long-name')
    expect(padTo('构建一个', 4)).toBe('构建一个')
  })

  test('the name column is sized to the widest name, up to a cap', () => {
    const rows = catalogRows(
      catalogFrom(
        {
          skills: {
            skillFrontmatter: [
              { name: 'a', source: 'userSettings' },
              { name: 'a-very-long-skill-name', source: 'userSettings' },
            ],
          },
        },
        0,
      ),
      'skills',
      {},
    )
    expect(nameWidth(rows, 40)).toBe(displayWidth('a-very-long-skill-name'))
    // Capped, so one long name cannot push the counts column off the pane.
    expect(nameWidth(rows, 12)).toBe(12)
  })

  test('an empty listing has no width to give', () => {
    expect(nameWidth([], 40)).toBe(0)
  })
})

describe('the scope order is the order drawn', () => {
  test('every scope has one place, so no row silently sorts last', () => {
    // `rank` falls back to the end for a scope it does not know; this pins that
    // every scope in the union is in the order, so no row is mistaken for one.
    for (const scope of SCOPE_ORDER) {
      expect(SCOPE_ORDER.filter(entry => entry === scope)).toHaveLength(1)
    }
    expect(SCOPE_ORDER).toHaveLength(7)
  })
})
