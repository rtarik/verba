import { useEffect, useMemo, useRef, useState } from 'react'
import type { Phrase, Text, WordToken } from '@content/schema'
import { useVocab, vocab } from '@/lib/vocab'
import { HoverCard, type HoverTarget } from './HoverCard'

/** How long the cursor must rest on a word before it counts as looked up. */
const DWELL_MS = 400

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
  fontSize,
}: {
  text: Text
  current: number
  playing: boolean
  fontSize: number
}) {
  const state = useVocab()
  const phrases = useMemo(() => phraseIndex(text.phrases), [text])
  const words = useMemo(() => text.tokens.filter((t): t is WordToken => t.k === 'w'), [text])
  const [target, setTarget] = useState<HoverTarget | null>(null)
  const closeTimer = useRef<number | null>(null)
  const dwellTimer = useRef<number | null>(null)
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

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (dwellTimer.current) window.clearTimeout(dwellTimer.current)
  }, [])

  const enter = (word: WordToken, el: HTMLElement) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (dwellTimer.current) window.clearTimeout(dwellTimer.current)

    const phrase = phrases.get(word.i) ?? null
    setTarget({ word, phrase, rect: el.getBoundingClientRect() })

    // Looking a word up is what marks it known. The dwell delay matters: without
    // it, sweeping the cursor across a line would mark the whole line known.
    dwellTimer.current = window.setTimeout(() => {
      const lemmas = phrase
        ? words.filter((w) => w.i >= phrase.from && w.i <= phrase.to && w.pos !== 'name').map((w) => w.lemma)
        : word.pos === 'name'
          ? []
          : [word.lemma]
      if (lemmas.length) vocab.markKnown(lemmas)
    }, DWELL_MS)
  }

  const leave = () => {
    if (dwellTimer.current) window.clearTimeout(dwellTimer.current)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setTarget(null), 120)
  }

  const hoveredPhrase = target?.phrase ?? null

  return (
    <>
      <div
        ref={container}
        style={{ fontFamily: 'var(--font-reading)', fontSize, lineHeight: 1.95 }}
        onMouseLeave={leave}
      >
        {text.tokens.map((t, k) => {
          if (t.k === 'br') return <div key={k} style={{ height: '1.1em' }} />
          if (t.k === 'p') return <span key={k}>{t.s}</span>

          // Proper nouns are not vocabulary — they are skipped by the tracker, so
          // if they were tinted they would stay tinted forever. Render them plain
          // while keeping them hoverable for the gloss.
          const status = t.pos === 'name' ? 'known' : state[t.lemma]?.status ?? 'unknown'
          const inPhrase = hoveredPhrase && t.i >= hoveredPhrase.from && t.i <= hoveredPhrase.to

          return (
            <span
              key={k}
              data-w={t.i}
              className={[
                'w',
                `w-${status}`,
                inPhrase ? 'w-inphrase' : '',
                playing && t.i === current ? 'w-playing' : '',
              ].join(' ')}
              onMouseEnter={(e) => enter(t, e.currentTarget)}
              onMouseLeave={leave}
              onClick={() => t.pos !== 'name' && vocab.toggle(t.lemma)}
            >
              {t.s}
            </span>
          )
        })}
      </div>

      {target && <HoverCard target={target} />}
    </>
  )
}
