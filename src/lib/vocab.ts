/**
 * Vocabulary tracking, persisted to localStorage.
 *
 * There is no backend, so this store is the entire user record. It is exposed
 * through useSyncExternalStore so the reader, the stats page, and the library
 * all reflect a status change the moment it happens.
 */
import { useSyncExternalStore } from 'react'

export type Status = 'unknown' | 'learning' | 'known' | 'ignored'

/** Click order. 'ignored' is reachable deliberately, not by cycling past 'known'. */
const CYCLE: Status[] = ['unknown', 'learning', 'known']

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
    return raw ? (JSON.parse(raw) as VocabState) : {}
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

  /** Advance a word one step: unknown -> learning -> known -> unknown. */
  cycle(lemma: string) {
    const cur = state[lemma]?.status ?? 'unknown'
    const next = cur === 'ignored' ? 'unknown' : CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]
    vocab.setStatus(lemma, next)
  },

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

  /** Merge an export back in, keeping the stronger status on conflict. */
  importJSON(raw: string): { added: number; merged: number } {
    const parsed = JSON.parse(raw) as { vocab?: VocabState }
    const incoming = parsed.vocab ?? (parsed as unknown as VocabState)
    const rank: Record<Status, number> = { unknown: 0, ignored: 1, learning: 2, known: 3 }
    const next = { ...state }
    let added = 0
    let merged = 0
    for (const [lemma, rec] of Object.entries(incoming)) {
      if (!rec || typeof rec.status !== 'string') continue
      if (!next[lemma]) {
        next[lemma] = rec
        added++
      } else {
        merged++
        next[lemma] = {
          ...next[lemma],
          status: rank[rec.status] > rank[next[lemma].status] ? rec.status : next[lemma].status,
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
  const state = useVocab()
  return state[lemma]?.status ?? 'unknown'
}

/** Share of a text's vocabulary already marked known or ignored. */
export function coverage(lemmas: string[], state: VocabState): number {
  if (!lemmas.length) return 0
  const solid = lemmas.filter((l) => {
    const s = state[l]?.status
    return s === 'known' || s === 'ignored'
  }).length
  return solid / lemmas.length
}

export function tally(state: VocabState) {
  const out = { unknown: 0, learning: 0, known: 0, ignored: 0 }
  for (const rec of Object.values(state)) out[rec.status]++
  return out
}
