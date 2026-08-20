/**
 * Vocabulary tracking, persisted to localStorage.
 *
 * Two states only. A word starts unknown and highlighted; looking it up (or
 * clicking it) marks it known and it drops its highlight. There is no
 * intermediate "learning" tier — reading is the review.
 *
 * There is no backend, so this store is the entire user record. It is exposed
 * through useSyncExternalStore so the reader, the stats page, and the library
 * all reflect a change the moment it happens.
 */
import { useSyncExternalStore } from 'react'

export type Status = 'unknown' | 'known'

export interface Record_ {
  status: Status
  firstSeen: string
  lastSeen: string
  seenCount: number
}

export type VocabState = Record<string, Record_>

const KEY = 'verba.vocab.v1'
const today = () => new Date().toISOString().slice(0, 10)

function load(): VocabState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as VocabState
    // Older saves used 'learning' / 'ignored'; fold them into the two-state model.
    for (const rec of Object.values(parsed)) {
      if (rec.status !== 'known' && rec.status !== 'unknown') {
        rec.status = (rec.status as string) === 'learning' ? 'known' : 'unknown'
      }
    }
    return parsed
  } catch {
    return {}
  }
}

let state: VocabState = load()
const listeners = new Set<() => void>()

function commit(next: VocabState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* quota or private mode — the session still works, it just will not persist */
  }
  listeners.forEach((l) => l())
}

export const vocab = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  snapshot: () => state,

  statusOf: (lemma: string): Status => state[lemma]?.status ?? 'unknown',

  setStatus(lemma: string, status: Status) {
    const prev = state[lemma]
    commit({
      ...state,
      [lemma]: {
        status,
        firstSeen: prev?.firstSeen ?? today(),
        lastSeen: today(),
        seenCount: prev?.seenCount ?? 1,
      },
    })
  },

  toggle(lemma: string) {
    vocab.setStatus(lemma, (state[lemma]?.status ?? 'unknown') === 'known' ? 'unknown' : 'known')
  },

  /** Mark one or more lemmas known. Used when a word or phrase is looked up. */
  markKnown(lemmas: string[]) {
    const next = { ...state }
    let changed = false
    for (const lemma of lemmas) {
      if (next[lemma]?.status === 'known') continue
      const prev = next[lemma]
      next[lemma] = {
        status: 'known',
        firstSeen: prev?.firstSeen ?? today(),
        lastSeen: today(),
        seenCount: prev?.seenCount ?? 1,
      }
      changed = true
    }
    if (changed) commit(next)
  },

  /** Record that these lemmas were encountered, without changing any status. */
  markSeen(lemmas: string[]) {
    const next = { ...state }
    let changed = false
    for (const lemma of lemmas) {
      const prev = next[lemma]
      if (prev?.lastSeen === today()) continue
      next[lemma] = {
        status: prev?.status ?? 'unknown',
        firstSeen: prev?.firstSeen ?? today(),
        lastSeen: today(),
        seenCount: (prev?.seenCount ?? 0) + 1,
      }
      changed = true
    }
    if (changed) commit(next)
  },

  reset: () => commit({}),

  exportJSON: () => JSON.stringify({ version: 1, exported: new Date().toISOString(), vocab: state }, null, 2),

  /** Merge an export back in. Known always wins over unknown. */
  importJSON(raw: string): { added: number; merged: number } {
    const parsed = JSON.parse(raw) as { vocab?: VocabState }
    const incoming = parsed.vocab ?? (parsed as unknown as VocabState)
    const next = { ...state }
    let added = 0
    let merged = 0
    for (const [lemma, rec] of Object.entries(incoming)) {
      if (!rec || typeof rec.status !== 'string') continue
      const status: Status = (rec.status as string) === 'unknown' ? 'unknown' : 'known'
      if (!next[lemma]) {
        next[lemma] = { ...rec, status }
        added++
      } else {
        merged++
        next[lemma] = {
          ...next[lemma],
          status: next[lemma].status === 'known' || status === 'known' ? 'known' : 'unknown',
          seenCount: Math.max(next[lemma].seenCount, rec.seenCount ?? 0),
          firstSeen: [next[lemma].firstSeen, rec.firstSeen].filter(Boolean).sort()[0],
        }
      }
    }
    commit(next)
    return { added, merged }
  },
}

export function useVocab(): VocabState {
  return useSyncExternalStore(vocab.subscribe, vocab.snapshot, vocab.snapshot)
}

export function useStatus(lemma: string): Status {
  return useVocab()[lemma]?.status ?? 'unknown'
}

/** Share of a text's vocabulary already known. */
export function coverage(lemmas: string[], state: VocabState): number {
  if (!lemmas.length) return 0
  return lemmas.filter((l) => state[l]?.status === 'known').length / lemmas.length
}

export function tally(state: VocabState) {
  const out = { unknown: 0, known: 0 }
  for (const rec of Object.values(state)) out[rec.status]++
  return out
}
