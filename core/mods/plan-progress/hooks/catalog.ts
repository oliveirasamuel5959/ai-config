import type { Catalog, CatalogEntry, Scope } from '../types'
import { displayWidth } from './progress'

/**
 * What the session has to hand, kept pure so it can be tested without an
 * engine: the skills and the agent types the engine lists for the context, the
 * scope each came from, and how the two are laid out in columns. Nothing here
 * touches `$` — `register.tsx` does the reading and writing.
 */

/**
 * The order the scopes are listed in. Fixed rather than alphabetical so a row
 * keeps its place as the session's listing changes: what is beside the code
 * comes first, then what is on the machine, then what a plugin brought, and
 * anything the engine names that this mod does not know comes last.
 */
export const SCOPE_ORDER: readonly Scope[] = [
  'project',
  'user',
  'plugin',
  'policy',
  'builtin',
  'mcp',
  'other',
]

/** The engine's word for where something came from, as the display scope. */
export function scopeOf(source: string): Scope {
  switch (source) {
    case 'projectSettings':
      return 'project'
    case 'userSettings':
      return 'user'
    case 'plugin':
      return 'plugin'
    case 'policySettings':
      return 'policy'
    case 'built-in':
      return 'builtin'
    case 'mcp':
      return 'mcp'
    // `syncedSkills` and anything newer than this mod: kept visible under a
    // group of its own rather than dropped, since a name the panel cannot place
    // is still a name the session can use.
    default:
      return 'other'
  }
}

/** The label the left column carries for a scope. */
export function groupLabel(scope: Scope): string {
  return scope
}

/** Which of the two listings a row belongs to. */
export type CatalogKind = 'skills' | 'agents'

export function emptyCatalog(): Catalog {
  return { skills: [], agents: [], readAt: 0, isRead: false }
}

/**
 * The part of the engine's context breakdown this mod reads, spelled
 * structurally so the pure module needs no import from the engine. Every field
 * is optional: the breakdown is absent without a bound session, and `skills` is
 * absent when the session lists none.
 */
export type BreakdownInput = {
  skills?: { skillFrontmatter?: readonly { name: string; source: string }[] } | undefined
  agents?: readonly { agentType: string; source: string }[] | undefined
}

/** Folds the engine's breakdown into the listings the panel draws. */
export function catalogFrom(breakdown: BreakdownInput | undefined, now: number): Catalog {
  if (breakdown === undefined) return emptyCatalog()
  const skills = (breakdown.skills?.skillFrontmatter ?? []).map(entry => ({
    name: entry.name,
    scope: scopeOf(entry.source),
  }))
  const agents = (breakdown.agents ?? []).map(entry => ({
    name: entry.agentType,
    scope: scopeOf(entry.source),
  }))
  // Read, even when both listings came back empty: the engine answered, and
  // that answer is worth saying out loud rather than leaving as "not asked".
  return { skills, agents, readAt: now, isRead: true }
}

/** One row of the catalog view: what it is, where from, and how often used. */
export type CatalogRow = {
  name: string
  scope: Scope
  /** How many times the goal used it; 0 for one that is only available. */
  used: number
  /** True on the first row of its scope, so the label is printed once. */
  isGroupStart: boolean
}

/**
 * The rows for one listing: everything available, with the session's own counts
 * folded on. Sorted by scope, then by name, so a group reads alphabetically and
 * a row does not move about as the counts change under it.
 *
 * A name that was used but that the engine does not list is kept rather than
 * dropped — it happens when a listing is trimmed to the context's budget, and a
 * skill the panel watched run is the last thing that should vanish from it.
 */
export function catalogRows(
  catalog: Catalog,
  kind: CatalogKind,
  used: Record<string, number>,
): CatalogRow[] {
  const entries = catalog[kind]
  const known = new Set(entries.map(entry => entry.name))
  const extra = Object.keys(used).filter(name => !known.has(name))
  const merged: CatalogEntry[] = [
    ...entries,
    ...extra.map(name => ({ name, scope: 'other' as Scope })),
  ]

  const sorted = [...merged].sort(
    (a, b) => rank(a.scope) - rank(b.scope) || a.name.localeCompare(b.name),
  )

  let previous: Scope | null = null
  return sorted.map(entry => {
    const isGroupStart = entry.scope !== previous
    previous = entry.scope
    return {
      name: entry.name,
      scope: entry.scope,
      used: used[entry.name] ?? 0,
      isGroupStart,
    }
  })
}

function rank(scope: Scope): number {
  const index = SCOPE_ORDER.indexOf(scope)
  return index === -1 ? SCOPE_ORDER.length : index
}

/** What a listing's header reads: how many there are, and how many ran. */
export type CatalogCounts = { available: number; used: number }

export function countsOf(rows: readonly CatalogRow[]): CatalogCounts {
  return {
    available: rows.length,
    used: rows.filter(row => row.used > 0).length,
  }
}

/**
 * Pads text to `cells` on screen, counting a wide glyph as two — so a name
 * column lines up whatever script a name is written in. Text already wider than
 * the column is returned as it stands; a caller that needs a hard column cuts
 * it with `truncate` first.
 */
export function padTo(text: string, cells: number): string {
  const width = displayWidth(text)
  if (width >= cells) return text
  return text + ' '.repeat(cells - width)
}

/** The widest name in a listing, so the column can be sized to the content. */
export function nameWidth(rows: readonly CatalogRow[], cap: number): number {
  let widest = 0
  for (const row of rows) widest = Math.max(widest, displayWidth(row.name))
  return Math.min(cap, widest)
}
