import { useEffect, useState } from 'react'
import type { Phrase, WordToken } from '@content/schema'
import { vocab, useStatus, type Status } from '@/lib/vocab'

const LABEL: Record<Status, string> = { unknown: 'New', learning: 'Learning', known: 'Known', ignored: 'Ignored' }
const ORDER: Status[] = ['unknown', 'learning', 'known', 'ignored']

export interface HoverTarget { word: WordToken; phrase: Phrase | null; rect: DOMRect }

export function HoverCard({
  target,
  onClose,
  onPlayFromHere,
  hasAudio,
}: {
  target: HoverTarget
  onClose: () => void
  onPlayFromHere: (i: number) => void
  hasAudio: boolean
}) {
  const { word, phrase, rect } = target
  const status = useStatus(word.lemma)
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean }>({ left: 0, top: 0, above: false })

  useEffect(() => {
    const W = 320
    const margin = 12
    const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - margin)
    // Flip above the word when there is not enough room beneath it.
    const above = rect.bottom + 200 > window.innerHeight && rect.top > 200
    setPos({ left, top: above ? rect.top - 8 : rect.bottom + 8, above })
  }, [rect])

  return (
    <div
      role="tooltip"
      onMouseEnter={() => {}}
      onMouseLeave={onClose}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 320,
        transform: pos.above ? 'translateY(-100%)' : undefined,
        background: 'var(--surface)',
        border: '1px solid var(--edge)',
        zIndex: 50,
      }}
      className="rounded-lg shadow-xl p-3.5 text-sm"
    >
      {phrase && (
        <div className="mb-3 pb-3" style={{ borderBottom: '1px solid var(--edge)' }}>
          <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--accent)' }}>
            Phrase
          </div>
          <div className="font-medium" style={{ fontFamily: 'var(--font-reading)' }}>{phrase.s}</div>
          <div style={{ color: 'var(--ink-soft)' }}>{phrase.gloss}</div>
          {phrase.note && <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{phrase.note}</p>}
        </div>
      )}

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-lg font-medium" style={{ fontFamily: 'var(--font-reading)' }}>{word.s}</span>
        {word.pos && <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>{word.pos}</span>}
      </div>
      <div className="mt-0.5" style={{ color: 'var(--ink-soft)' }}>{word.gloss}</div>
      {word.lemma.toLowerCase() !== word.s.toLowerCase() && (
        <div className="mt-1 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          from <span style={{ color: 'var(--accent)' }}>{word.lemma}</span>
        </div>
      )}
      {word.note && <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{word.note}</p>}

      <div className="mt-3 flex gap-1">
        {ORDER.map((s) => (
          <button
            key={s}
            onClick={() => vocab.setStatus(word.lemma, s)}
            className="flex-1 rounded px-1.5 py-1 text-[11px] transition-colors"
            style={
              status === s
                ? { background: 'var(--accent)', color: 'var(--paper)' }
                : { background: 'var(--accent-soft)', color: 'var(--ink-soft)' }
            }
          >
            {LABEL[s]}
          </button>
        ))}
      </div>

      {hasAudio && (
        <button
          onClick={() => onPlayFromHere(word.i)}
          className="mt-2 w-full rounded px-2 py-1.5 text-[12px]"
          style={{ border: '1px solid var(--edge)', color: 'var(--ink-soft)' }}
        >
          ▶ Play from here
        </button>
      )}
    </div>
  )
}
