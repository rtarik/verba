/**
 * Colour theme: follow the system, or override it.
 *
 * Three states rather than a plain switch, so choosing a theme once does not
 * permanently sever the link to the OS setting. 'auto' removes the attribute
 * entirely and lets the prefers-color-scheme media query decide.
 */
import { useSyncExternalStore } from 'react'

export type Theme = 'auto' | 'light' | 'dark'

export const KEY = 'verba.theme.v1'
const ORDER: Theme[] = ['auto', 'light', 'dark']

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

function apply(t: Theme) {
  const root = document.documentElement
  if (t === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
}

let state: Theme = read()
const listeners = new Set<() => void>()

export const theme = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  snapshot: () => state,

  set(t: Theme) {
    state = t
    try {
      if (t === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, t)
    } catch {
      /* private mode — the choice still applies for this session */
    }
    apply(t)
    listeners.forEach((l) => l())
  },

  cycle() {
    theme.set(ORDER[(ORDER.indexOf(state) + 1) % ORDER.length])
  },
}

export const useTheme = () => useSyncExternalStore(theme.subscribe, theme.snapshot, () => 'auto' as Theme)
