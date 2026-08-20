/**
 * Keeps playback position and the highlighted word in step.
 *
 * Driven by requestAnimationFrame rather than the audio element's `timeupdate`
 * event, which only fires about four times a second — far too coarse for
 * word-level highlighting to look right.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Text } from '@content/schema'

/** Index of the last word whose start time has passed. Binary search. */
function indexAt(starts: number[], t: number): number {
  let lo = 0
  let hi = starts.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (starts[mid] <= t) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

export const SPEEDS = [0.6, 0.75, 0.85, 1] as const

export function useAudioSync(text: Text | null) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [current, setCurrent] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [progress, setProgress] = useState(0)

  const starts = useMemo(() => text?.audio?.starts ?? null, [text])

  useEffect(() => {
    setCurrent(-1)
    setPlaying(false)
    setProgress(0)
  }, [text?.id])

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed
  }, [speed, text?.id])

  /** Pull the highlight and progress bar into line with the audio clock. */
  const sync = useCallback(() => {
    const a = ref.current
    if (!a || !starts) return
    setCurrent(indexAt(starts, a.currentTime))
    if (a.duration) setProgress(a.currentTime / a.duration)
  }, [starts])

  // requestAnimationFrame is suspended entirely while the tab is in the
  // background, so it cannot be the only clock — a listener who switches tabs
  // would come back to a frozen highlight. The element's own `timeupdate`
  // keeps firing when hidden (~4Hz), so rAF provides smoothness when visible
  // and timeupdate provides the floor when it is not.
  useEffect(() => {
    if (!playing || !starts) return
    let raf = 0
    const tick = () => {
      sync()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, starts, sync])

  const toggle = useCallback(() => {
    const a = ref.current
    if (!a) return
    if (a.paused) void a.play()
    else a.pause()
  }, [])

  /** Jump to a word and keep playing from there. */
  const seekToWord = useCallback(
    (i: number) => {
      const a = ref.current
      if (!a || !starts || i < 0 || i >= starts.length) return
      a.currentTime = starts[i]
      setCurrent(i)
      if (a.paused) void a.play()
    },
    [starts]
  )

  const bind = {
    ref,
    onTimeUpdate: sync,
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => {
      setPlaying(false)
      setCurrent(-1)
      setProgress(1)
    },
  }

  return { bind, current, playing, toggle, seekToWord, speed, setSpeed, progress, hasAudio: Boolean(starts) }
}
