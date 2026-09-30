/**
 * Practice: what can be drilled, and building a session from it.
 *
 * Every drill tense and every verb the course uses is always available;
 * nothing waits on reading progress.
 */
import type { VerbEntry } from '@content/schema'
import verbsJson from '@content/build/verbs.json'
import { DRILL_TENSES, TENSES, type Person, type TenseId, type VerbSpecs } from '@engine/conjugate'
import { createChecker, type Prompt, type Regularity, type Verdict } from '@engine/check'
import { mastery, score, cellKey, type MasteryState } from '@/lib/mastery'
import { library, units } from '@/lib/content'

const data = verbsJson as { specs: VerbSpecs; entries: VerbEntry[] }

export const checker = createChecker(data.specs)
export const conj = checker.conjugator
export const verbs: VerbEntry[] = [...data.entries].sort((a, b) => a.inf.localeCompare(b.inf, 'es'))
export const verbByInf = new Map(verbs.map((v) => [v.inf, v]))
const allVerbs = verbs.map((v) => v.inf)

/** How a verb is shown: pronominal verbs with their -se. */
export const displayInf = (inf: string) => (conj.spec(inf).refl ? `${inf}se` : inf)

export const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
export const tensesByLevel = LEVELS.map((level) => ({ level, tenses: DRILL_TENSES.filter((t) => TENSES[t].level === level) }))

/* ---- sessions ----------------------------------------------------------- */

/** conjugate: produce one form · table: a whole paradigm · identify: name a form's verb, tense and person. */
export type Mode = 'conjugate' | 'table' | 'identify'
/** 'all': every course verb; 'irregular': only where the tense is irregular or stem-changing. */
export type Pool = 'all' | 'irregular' | 'one'

export interface Settings {
  mode: Mode
  tenses: TenseId[]
  pool: Pool
  /** The verb for pool 'one'. */
  verb: string
  /** A unit's own practice set: its tenses, with the verbs from its texts. */
  unit?: number
  /** Weak spots: cells drawn by how weak they are. */
  weak?: boolean
  /** One cell of the mastery grid, from the Progress page heatmap. */
  cell?: { tense: TenseId; person: Person; reg?: Regularity }
}

export interface Item extends Prompt {
  /** Persons to fill in table mode; the single person otherwise. */
  persons: Person[]
  /**
   * Identify mode: the form on show. Where a cell has two spellings, either
   * may appear — hablara and hablase both need recognising.
   */
  shown?: string
}

export const SESSION_LENGTH: Record<Mode, number> = { conjugate: 12, table: 5, identify: 12 }

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

const shuffle = <T,>(xs: T[]): T[] => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Mark an answer and record it against the learner's mastery. */
export function markAnswer(item: Prompt, typed: string): Verdict {
  const verdict = checker.check(item, typed)
  mastery.record({ inf: item.inf, tense: item.tense, person: item.person, reg: checker.regularity(item.inf, item.tense), verdict })
  return verdict
}

/* ---- unit practice ------------------------------------------------------ */

/** Verbs used in a unit's texts. */
export function unitVerbs(unit: number): string[] {
  const u = units.find((x) => x.unit === unit)
  if (!u) return []
  const found = new Set<string>()
  for (const id of u.textIds) for (const l of library.find((t) => t.id === id)?.lemmas ?? []) if (verbByInf.has(l)) found.add(l)
  return [...found]
}

/** Settings for a unit's practice set, or null if it has none. */
export function unitSettings(unit: number): Settings | null {
  const u = units.find((x) => x.unit === unit)
  if (!u?.practice || !u.textIds.length) return null
  return { mode: 'conjugate', tenses: u.practice.tenses as TenseId[], pool: 'all', verb: '', unit }
}

/** Every verb × tense pair the settings allow. */
export function candidatePairs(s: Settings): Array<{ inf: string; tense: TenseId }> {
  const tenses = s.tenses
  const pool = s.unit ? unitVerbs(s.unit) : s.pool === 'one' ? (verbByInf.has(s.verb) ? [s.verb] : []) : allVerbs
  const pairs: Array<{ inf: string; tense: TenseId }> = []
  for (const tense of tenses) {
    for (const inf of pool) {
      const persons = conj.persons(inf, tense)
      if (!persons.length || conj.conjugate(inf, tense, persons[0]).length === 0) continue
      // A table needs a whole paradigm; gustar-type verbs only have two cells.
      if (s.mode === 'table' && persons.length < 5) continue
      if (s.pool === 'irregular' && !['stem', 'irregular'].includes(checker.regularity(inf, tense))) continue
      pairs.push({ inf, tense })
    }
  }
  return pairs
}

/**
 * A fresh session. Tenses are taken in turn so each gets its share, verbs are
 * drawn without repeats while any remain, and no cell is asked twice while
 * unasked ones remain. A narrow choice (one verb, one tense) gives a shorter
 * set rather than the same question again.
 */
/** How many questions a set will have: the usual number, or fewer if that is all there is. */
export function sessionLength(mode: Mode, pairs: Array<{ inf: string; tense: TenseId }>): number {
  const available = mode === 'table' ? pairs.length : pairs.reduce((n, p) => n + conj.persons(p.inf, p.tense).length, 0)
  return Math.min(SESSION_LENGTH[mode], available)
}

export function buildSession(s: Settings, m: MasteryState = mastery.snapshot()): Item[] {
  if (s.weak) return weakSession(m)
  if (s.cell) return cellSession(s.cell, m)
  const pairs = candidatePairs(s)
  if (!pairs.length) return []
  const length = sessionLength(s.mode, pairs)

  const byTense = new Map<TenseId, string[]>()
  for (const p of pairs) byTense.set(p.tense, [...(byTense.get(p.tense) ?? []), p.inf])
  const queues = new Map([...byTense].map(([t, infs]) => [t, shuffle(infs)]))
  const order = shuffle([...byTense.keys()])
  const asked = new Set<string>()

  const items: Item[] = []
  for (let n = 0; items.length < length && n < length * 50; n++) {
    const tense = order[n % order.length]
    let queue = queues.get(tense)!
    if (!queue.length) queue = shuffle(byTense.get(tense)!)
    const inf = queue.shift()!
    queues.set(tense, queue)
    const refl = conj.spec(inf).refl ?? false
    const persons = conj.persons(inf, tense)
    const fresh = persons.filter((p) => !asked.has(`${inf}|${tense}|${s.mode === 'table' ? '*' : p}`))
    if (!fresh.length) continue
    const person = fresh[Math.floor(Math.random() * fresh.length)]
    asked.add(`${inf}|${tense}|${s.mode === 'table' ? '*' : person}`)
    const it: Item = { inf, tense, person, refl, persons: s.mode === 'table' ? persons : [person] }
    if (s.mode === 'identify') it.shown = pick(conj.conjugate(inf, tense, person, { refl }))
    items.push(it)
  }
  return items
}

/* ---- weak spots --------------------------------------------------------- */

const item = (inf: string, tense: TenseId, person: Person): Item => ({
  inf, tense, person, refl: conj.spec(inf).refl ?? false, persons: [person],
})

/** Pick one entry, each with probability proportional to its weight. */
function weighted<T>(entries: Array<[T, number]>): T {
  const total = entries.reduce((n, [, w]) => n + w, 0)
  let r = Math.random() * total
  for (const [x, w] of entries) if ((r -= w) <= 0) return x
  return entries[entries.length - 1][0]
}

/** Verbs that caused misses come up more often, but never exclusively. */
const verbWeight = (inf: string, m: MasteryState) => 1 + Math.min(4, m.verbs[inf]?.misses ?? 0)

/** Verbs grouped by how they behave in each tense. Worked out once, on first use. */
let cellGroups: Map<string, string[]> | null = null
function verbsByCell(): Map<string, string[]> {
  if (cellGroups) return cellGroups
  const groups = new Map<string, string[]>()
  for (const tense of DRILL_TENSES) {
    for (const inf of allVerbs) {
      for (const person of conj.persons(inf, tense)) {
        const k = cellKey(tense, person, checker.regularity(inf, tense))
        const g = groups.get(k)
        if (g) g.push(inf)
        else groups.set(k, [inf])
      }
    }
  }
  cellGroups = groups
  return groups
}

/** Share of a weak-spots set spent exploring cells never practised. */
const EXPLORE = 0.25

/**
 * Cells drawn in proportion to how weak they are. About a quarter of the set
 * explores cells never practised — enough to find new weak spots, never
 * enough to drown the known ones (there are far more untried cells than
 * weak ones). With no history at all, the whole set explores.
 */
function weakSession(m: MasteryState): Item[] {
  const groups = verbsByCell()
  const seen: Array<[string, number]> = []
  const unseen: Array<[string, number]> = []
  for (const k of groups.keys()) {
    const rec = m.cells[k]
    if (rec) seen.push([k, Math.max(0.03, 1 - score(rec)) ** 1.5])
    else unseen.push([k, 1])
  }
  if (!seen.length && !unseen.length) return []
  const items: Item[] = []
  const asked = new Set<string>()
  for (let n = 0; items.length < SESSION_LENGTH.conjugate && n < 500; n++) {
    const explore = !seen.length || (unseen.length > 0 && Math.random() < EXPLORE)
    const k = weighted(explore ? unseen : seen)
    const [tense, person] = k.split('|')
    const inf = weighted(groups.get(k)!.map((v) => [v, verbWeight(v, m)] as [string, number]))
    const id = `${inf}|${k}`
    if (asked.has(id)) continue
    asked.add(id)
    items.push(item(inf, tense as TenseId, Number(person) as Person))
  }
  return items
}

/** One cell of the grid, with verbs of the chosen kind (or any kind). */
function cellSession(cell: NonNullable<Settings['cell']>, m: MasteryState): Item[] {
  const infs = allVerbs.filter(
    (inf) => conj.persons(inf, cell.tense).includes(cell.person) && (!cell.reg || checker.regularity(inf, cell.tense) === cell.reg)
  )
  const picked: string[] = []
  const pool = infs.map((v) => [v, verbWeight(v, m)] as [string, number])
  while (picked.length < Math.min(SESSION_LENGTH.conjugate, infs.length)) {
    const inf = weighted(pool.filter(([v]) => !picked.includes(v)))
    picked.push(inf)
  }
  return picked.map((inf) => item(inf, cell.tense, cell.person))
}

/* ---- remembered settings ------------------------------------------------ */

const SETTINGS_KEY = 'verba.practice.settings.v1'

export function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Settings & { everything?: boolean }
    // Older saves called the whole pool 'met' and carried an unlock override.
    const { everything: _, ...rest } = s
    return {
      ...rest,
      pool: (s.pool as string) === 'met' ? 'all' : s.pool,
      unit: undefined, weak: undefined, cell: undefined,
      tenses: s.tenses.filter((t) => (DRILL_TENSES as readonly string[]).includes(t)),
    }
  } catch {
    return null
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* non-fatal: settings just will not be remembered */
  }
}
