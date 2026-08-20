import { useEffect, useState } from 'react'
import type { Phrase, WordToken } from '@content/schema'
import { useStatus } from '@/lib/vocab'

export interface HoverTarget { word: WordToken; phrase: Phrase | null; rect: DOMRect }

/**
 * Read-only lookup card.
 *
 * Deliberately non-interactive: `pointer-events: none` means it can never sit
 * between the cursor and the word underneath, which is what made the old
 * in-card button awkward to hit. Everything actionable happens on the word
 * itself — hover to learn it, click to toggle it back.
 */
export function HoverCard({ target }: { target: HoverTarget }) {
  const { word, phrase, rect } = target
  const status = useStatus(word.lemma)
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean }>({ left: 0, top: 0, above: false })

  useEffect(() => {
    const W = 300
    const margin = 12
    const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - margin)
    // Flip above the word when there is not enough room beneath it.
    const above = rect.bottom + 190 > window.innerHeight && rect.top > 190
    setPos({ left, top: above ? rect.top - 8 : rect.bottom + 8, above })
  }, [rect])

  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: 300,
        transform: pos.above ? 'translateY(-100%)' : undefined,
        background: 'var(--surface)',
        border: '1px solid var(--edge)',
        pointerEvents: 'none',
        zIndex: 50,
      }}
      className="rounded-lg p-3.5 text-sm shadow-xl"
    >
      {phrase && (
        <div className="mb-3 pb-3" style={{ borderBottom: '1px solid var(--edge)' }}>
          <div className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Phrase</div>
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

      {status === 'known' && (
        <div className="mt-2.5 text-[11px]" style={{ color: 'var(--accent)' }}>
          ✓ known — click the word to un-mark
        </div>
      )}
    </div>
  )
}
