import { useEffect, useMemo, useRef, useState } from 'react'
import type { Phrase, Text, WordToken } from '@content/schema'
import { useVocab, vocab } from '@/lib/vocab'
import { HoverCard, type HoverTarget } from './HoverCard'

/** Word index -> the phrase containing it, so hovering lights the whole group. */
function phraseIndex(phrases: Phrase[]): Map<number, Phrase> {
  const m = new Map<number, Phrase>()
  for (const p of phrases) for (let i = p.from; i <= p.to; i++) m.set(i, p)
  return m
}

export function TextBody({
  text,
  current,
  playing,
  onPlayFromHere,
  fontSize,
}: {
  text: Text
  current: number
  playing: boolean
  onPlayFromHere: (i: number) => void
  fontSize: number
}) {
  const state = useVocab()
  const phrases = useMemo(() => phraseIndex(text.phrases), [text])
  const [target, setTarget] = useState<HoverTarget | null>(null)
  const closeTimer = useRef<number | null>(null)
  const container = useRef<HTMLDivElement>(null)

  // Keep the spoken word on screen without yanking the page around.
  useEffect(() => {
    if (!playing || current < 0) return
    const el = container.current?.querySelector<HTMLElement>(`[data-w="${current}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 90 || r.bottom > window.innerHeight - 140) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [current, playing])

  const open = (word: WordToken, el: HTMLElement) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    setTarget({ word, phrase: phrases.get(word.i) ?? null, rect: el.getBoundingClientRect() })
  }
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setTarget(null), 140)
  }

  const hoveredPhrase = target?.phrase ?? null

  return (
    <>
      <div
        ref={container}
        style={{ fontFamily: 'var(--font-reading)', fontSize, lineHeight: 1.95 }}
        onMouseLeave={scheduleClose}
      >
        {text.tokens.map((t, k) => {
          if (t.k === 'br') return <div key={k} style={{ height: '1.1em' }} />
          if (t.k === 'p') return <span key={k}>{t.s}</span>

          const status = state[t.lemma]?.status ?? 'unknown'
          const inPhrase = hoveredPhrase && t.i >= hoveredPhrase.from && t.i <= hoveredPhrase.to
          const isPlaying = playing && t.i === current

          return (
            <span
              key={k}
              data-w={t.i}
              className={[
                'w',
                `w-${status}`,
                inPhrase ? 'w-inphrase' : '',
                isPlaying ? 'w-playing' : '',
              ].join(' ')}
              onMouseEnter={(e) => open(t, e.currentTarget)}
              onClick={() => vocab.cycle(t.lemma)}
              title={t.gloss}
            >
              {t.s}
            </span>
          )
        })}
      </div>

      {target && (
        <HoverCard
          target={target}
          onClose={scheduleClose}
          onPlayFromHere={onPlayFromHere}
          hasAudio={Boolean(text.audio)}
        />
      )}
    </>
  )
}
