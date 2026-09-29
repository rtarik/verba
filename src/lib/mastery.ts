/**
 * Drill results, persisted to localStorage.
 *
 * Kept per cell of the grid a learner actually struggles along: tense ×
 * person × how the verb behaves in that tense (regular, spelling change, stem
 * change, irregular). "Irregular nosotros preterites" is a real weak spot;
 * "tener" alone usually is not. Verbs are tracked separately, but only their
 * misses, so a weak cell can be drilled with the verbs that caused it.
 *
 * A cell's score is its recent accuracy, weighted towards the latest answers,
 * so old mistakes fade as they stop happening.
 */
import { useSyncExternalStore } from 'react'
import type { Person, TenseId } from '@engine/conjugate'
import type { Regularity, Verdict } from '@engine/check'

/** Results oldest → newest: c correct, a accent slip, w wrong. */
type Mark = 'c' | 'a' | 'w'

export interface CellRecord {
  attempts: number
  recent: string
  lastSeen: string
}

export interface VerbRecord {
  misses: number
  lastMiss: string
}

export interface MasteryState {
  cells: Record<string, CellRecord>
  verbs: Record<string, VerbRecord>
}

const KEY = 'verba.drills.v1'
const RECENT = 8
const today = () => new Date().toISOString().slice(0, 10)
const empty = (): MasteryState => ({ cells: {}, verbs: {} })

export const cellKey = (tense: TenseId, person: Person, reg: Regularity) => `${tense}|${person}|${reg}`
export const parseCellKey = (k: string) => {
  const [tense, person, reg] = k.split('|')
  return { tense: tense as TenseId, person: Number(person) as Person, reg: reg as Regularity }
}

function load(): MasteryState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...empty(), ...(JSON.parse(raw) as MasteryState) } : empty()
  } catch {
    return empty()
  }
}

let state: MasteryState = load()
const listeners = new Set<() => void>()

function commit(next: MasteryState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* non-fatal: the session still works, it just will not persist */
  }
  listeners.forEach((l) => l())
}

const VALUE: Record<Mark, number> = { c: 1, a: 0.75, w: 0 }

/** Recent accuracy, 0–1, each older answer counting 0.8× the one after it. */
export function score(rec: CellRecord): number {
  let num = 0
  let den = 0
  const marks = rec.recent.split('') as Mark[]
  marks.forEach((m, i) => {
    const w = 0.8 ** (marks.length - 1 - i)
    num += VALUE[m] * w
    den += w
  })
  return den ? num / den : 0
}

export const mastery = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  snapshot: () => state,

  /** Record one marked answer. */
  record(r: { inf: string; tense: TenseId; person: Person; reg: Regularity; verdict: Verdict }) {
    const mark: Mark = r.verdict.result === 'correct' ? 'c' : r.verdict.result === 'accent' ? 'a' : 'w'
    const k = cellKey(r.tense, r.person, r.reg)
    const prev = state.cells[k] ?? { attempts: 0, recent: '', lastSeen: today() }
    const cells = { ...state.cells, [k]: { attempts: prev.attempts + 1, recent: (prev.recent + mark).slice(-RECENT), lastSeen: today() } }
    let verbs = state.verbs
    if (mark === 'w') {
      const v = state.verbs[r.inf] ?? { misses: 0, lastMiss: today() }
      verbs = { ...state.verbs, [r.inf]: { misses: v.misses + 1, lastMiss: today() } }
    }
    commit({ cells, verbs })
  },

  /** Merge a backup in: for each cell, the record with more practice behind it wins. */
  merge(incoming: Partial<MasteryState>) {
    const cells = { ...state.cells }
    for (const [k, rec] of Object.entries(incoming.cells ?? {})) {
      if (!rec || typeof rec.recent !== 'string') continue
      if (!cells[k] || rec.attempts > cells[k].attempts) cells[k] = rec
    }
    const verbs = { ...state.verbs }
    for (const [inf, rec] of Object.entries(incoming.verbs ?? {})) {
      if (!rec || typeof rec.misses !== 'number') continue
      if (!verbs[inf] || rec.misses > verbs[inf].misses) verbs[inf] = rec
    }
    commit({ cells, verbs })
  },

  reset: () => commit(empty()),
}

export function useMastery(): MasteryState {
  return useSyncExternalStore(mastery.subscribe, mastery.snapshot, mastery.snapshot)
}
