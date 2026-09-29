/**
 * Practice: what can be drilled, and building a session from it.
 *
 * Unlocking follows the reading, the same way vocabulary does. A tense opens
 * once one of its grammar pages is read, or a text linking to one; a verb
 * opens once the text that introduces it is read. "Show everything" lifts
 * both, for anyone who wants to drill ahead.
 */
import type { VerbEntry } from '@content/schema'
import verbsJson from '@content/build/verbs.json'
import { DRILL_TENSES, TENSES, type Person, type TenseId, type VerbSpecs } from '@engine/conjugate'
import { createChecker, type Prompt } from '@engine/check'
import { grammarById, library } from '@/lib/content'
import type { ProgressState, GrammarReadState } from '@/lib/progress'

const data = verbsJson as { specs: VerbSpecs; entries: VerbEntry[]; unlock: Record<string, string[]> }

export const checker = createChecker(data.specs)
export const conj = checker.conjugator
export const verbs: VerbEntry[] = [...data.entries].sort((a, b) => a.inf.localeCompare(b.inf, 'es'))
export const verbByInf = new Map(verbs.map((v) => [v.inf, v]))
export const unlockPages = (t: TenseId) => (data.unlock[t] ?? []).map((id) => grammarById(id)).filter((d) => d !== undefined)

/** How a verb is shown: pronominal verbs with their -se. */
export const displayInf = (inf: string) => (conj.spec(inf).refl ? `${inf}se` : inf)

export const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const
export const tensesByLevel = LEVELS.map((level) => ({ level, tenses: DRILL_TENSES.filter((t) => TENSES[t].level === level) }))

/* ---- unlocking ---------------------------------------------------------- */

export interface Unlocked {
  tenses: Set<TenseId>
  verbs: Set<string>
}

export function unlocked(read: ProgressState, grammarRead: GrammarReadState, everything: boolean): Unlocked {
  if (everything) return { tenses: new Set(DRILL_TENSES), verbs: new Set(verbs.map((v) => v.inf)) }
  const met = new Set(Object.keys(grammarRead))
  for (const t of library) if (read[t.id]) for (const g of t.grammarRefs) met.add(g)
  return {
    tenses: new Set(DRILL_TENSES.filter((t) => (data.unlock[t] ?? []).some((g) => met.has(g)))),
    verbs: new Set(verbs.filter((v) => read[v.firstSeenIn]).map((v) => v.inf)),
  }
}

/* ---- sessions ----------------------------------------------------------- */

export type Mode = 'conjugate' | 'table'
/** 'met': every unlocked verb; 'irregular': only where the tense is irregular or stem-changing. */
export type Pool = 'met' | 'irregular' | 'one'

export interface Settings {
  mode: Mode
  tenses: TenseId[]
  pool: Pool
  /** The verb for pool 'one'. */
  verb: string
  /** Ignore unlocking and offer every tense and verb. */
  everything: boolean
}

export interface Item extends Prompt {
  /** Persons to fill in table mode; the single person otherwise. */
  persons: Person[]
}

export const SESSION_LENGTH: Record<Mode, number> = { conjugate: 12, table: 5 }

const shuffle = <T,>(xs: T[]): T[] => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Every verb × tense pair the settings allow. */
export function candidatePairs(s: Settings, open: Unlocked): Array<{ inf: string; tense: TenseId }> {
  const tenses = s.tenses.filter((t) => open.tenses.has(t))
  const pool = s.pool === 'one' ? (verbByInf.has(s.verb) ? [s.verb] : []) : [...open.verbs]
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

export function buildSession(s: Settings, open: Unlocked): Item[] {
  const pairs = candidatePairs(s, open)
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
    items.push({ inf, tense, person, refl, persons: s.mode === 'table' ? persons : [person] })
  }
  return items
}

/* ---- remembered settings ------------------------------------------------ */

const SETTINGS_KEY = 'verba.practice.settings.v1'

export function loadSettings(): Settings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Settings
    return { ...s, tenses: s.tenses.filter((t) => (DRILL_TENSES as readonly string[]).includes(t)) }
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
