/**
 * Which texts have been read.
 *
 * Separate from vocabulary: knowing every word in a text is not the same as
 * having worked through it, and the library needs the second fact to know
 * where to send you next.
 */
import { useSyncExternalStore } from 'react'

export interface ReadRecord {
  readAt: string
  /** Share of the text's vocabulary known at the moment it was marked read. */
  coverage: number
}

export type ProgressState = Record<string, ReadRecord>

const KEY = 'verba.progress.v1'
const today = () => new Date().toISOString().slice(0, 10)

function load(): ProgressState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as ProgressState) : {}
  } catch {
    return {}
  }
}

let state: ProgressState = load()
const listeners = new Set<() => void>()

function commit(next: ProgressState) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* non-fatal: the session still works, it just will not persist */
  }
  listeners.forEach((l) => l())
}

export const progress = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  snapshot: () => state,

  isRead: (id: string) => Boolean(state[id]),

  markRead(id: string, coverage: number) {
    if (state[id]) return
    commit({ ...state, [id]: { readAt: today(), coverage } })
  },

  unmarkRead(id: string) {
    if (!state[id]) return
    const next = { ...state }
    delete next[id]
    commit(next)
  },

  reset: () => commit({}),
  replace: (next: ProgressState) => commit(next),
}

export function useProgress(): ProgressState {
  return useSyncExternalStore(progress.subscribe, progress.snapshot, progress.snapshot)
}


/* ------------------------------------------------------------------ *
 * Grammar pages read
 *
 * Kept in its own store rather than sharing the text map above: the
 * library counts Object.keys(progress) as "texts read", and folding
 * grammar ids into it would quietly corrupt that number.
 * ------------------------------------------------------------------ */

export type GrammarReadState = Record<string, { readAt: string }>

const GRAMMAR_KEY = 'verba.grammar.v1'

function loadGrammar(): GrammarReadState {
  try {
    const raw = localStorage.getItem(GRAMMAR_KEY)
    return raw ? (JSON.parse(raw) as GrammarReadState) : {}
  } catch {
    return {}
  }
}

let grammarState: GrammarReadState = loadGrammar()
const grammarListeners = new Set<() => void>()

function commitGrammar(next: GrammarReadState) {
  grammarState = next
  try {
    localStorage.setItem(GRAMMAR_KEY, JSON.stringify(next))
  } catch {
    /* non-fatal */
  }
  grammarListeners.forEach((l) => l())
}

export const grammarProgress = {
  subscribe(l: () => void) {
    grammarListeners.add(l)
    return () => grammarListeners.delete(l)
  },
  snapshot: () => grammarState,

  isRead: (id: string) => Boolean(grammarState[id]),

  markRead(id: string) {
    if (grammarState[id]) return
    commitGrammar({ ...grammarState, [id]: { readAt: today() } })
  },

  toggle(id: string) {
    if (grammarState[id]) {
      const next = { ...grammarState }
      delete next[id]
      commitGrammar(next)
    } else {
      commitGrammar({ ...grammarState, [id]: { readAt: today() } })
    }
  },

  /** Merge a backup in: a page read in either copy counts as read. */
  merge(incoming: GrammarReadState) {
    const next = { ...grammarState }
    for (const [id, rec] of Object.entries(incoming)) if (!next[id] && rec?.readAt) next[id] = rec
    commitGrammar(next)
  },

  reset: () => commitGrammar({}),
}

export function useGrammarProgress(): GrammarReadState {
  return useSyncExternalStore(grammarProgress.subscribe, grammarProgress.snapshot, grammarProgress.snapshot)
}
