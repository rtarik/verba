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
