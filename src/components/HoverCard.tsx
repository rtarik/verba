import { useLayoutEffect, useRef, useState } from 'react'
import type { Phrase, WordToken } from '@content/schema'
import { TENSES, isCommand, type Person, type TenseId } from '@engine/conjugate'
import { personLabel } from '@engine/check'
import { useStatus } from '@/lib/vocab'
import { conj } from '@/lib/practice'

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
  const card = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Placed after measuring, since a verb card with a phrase and a note is far
  // taller than a plain one: below the word if it fits, else above, else
  // wherever keeps the whole card on screen.
  useLayoutEffect(() => {
    const W = 300
    const margin = 12
    const h = card.current?.offsetHeight ?? 0
    const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - margin)
    const below = rect.bottom + 8
    const above = rect.top - 8 - h
    const top = below + h <= window.innerHeight - margin ? below
      : above >= margin ? above
        : Math.max(margin, window.innerHeight - margin - h)
    setPos({ left, top })
  }, [rect, word, phrase])

  return (
    <div
      ref={card}
      role="tooltip"
      style={{
        position: 'fixed',
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        width: 300,
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

      {word.morph && word.morph.length > 0 && <VerbForm word={word} />}

      {status === 'known' && (
        <div className="mt-2.5 text-[11px]" style={{ color: 'var(--accent)' }}>
          ✓ known — click the word to un-mark
        </div>
      )}
    </div>
  )
}

const NON_FINITE: Record<string, [string, string]> = {
  infinitivo: ['infinitivo', 'infinitive'],
  gerundio: ['gerundio', 'gerund'],
  participio: ['participio', 'past participle'],
}

/**
 * What form of its verb a word is — tense and person, every reading when the
 * form is ambiguous — and the row of that tense, with this form picked out.
 */
function VerbForm({ word }: { word: WordToken }) {
  const morph = word.morph!
  const first = morph.find((m) => m.tense in TENSES)
  const row = first ? conj.table(word.lemma, first.tense as TenseId).map((cell) => cell[0]) : []
  // In a compound tense the row is the auxiliary's; the participle follows once.
  const participle = first?.compound ? conj.participle(word.lemma) : null
  const highlight = new Set(first?.persons ?? [])

  return (
    <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--edge)' }}>
      <div className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
        Verb form{morph.length > 1 && ' · more than one reading'}
      </div>
      {morph.slice(0, 3).map((m, k) => {
        const [es, en] = m.tense in TENSES ? [TENSES[m.tense as TenseId].name, TENSES[m.tense as TenseId].en] : NON_FINITE[m.tense] ?? [m.tense, '']
        const who = m.persons?.map((p) => personLabel(m.tense as TenseId, p as Person)).join(' or ')
        return (
          <div key={k} className="text-[13px] leading-snug">
            <span className="font-medium">{es}</span>
            <span style={{ color: 'var(--ink-soft)' }}> · {en}</span>
            {who && <span> — {who}</span>}
          </div>
        )
      })}
      {first?.compound && (
        <div className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
          with <i style={{ fontFamily: 'var(--font-reading)' }}>{first.compound}</i>
        </div>
      )}
      {row.length > 0 && (
        <div className="mt-1.5 text-[13px] leading-relaxed" style={{ fontFamily: 'var(--font-reading)', color: 'var(--ink-soft)' }}>
          {row.map((f, p) => {
            if (!f || (isCommand(first!.tense as TenseId) && p === 0)) return null
            const shown = participle ? f.replace(` ${participle}`, '') : f
            return (
              <span key={p}>
                <span style={highlight.has(p) ? { color: 'var(--ink)', background: 'var(--accent-soft)', borderRadius: 3, padding: '0 2px' } : undefined}>
                  {shown}
                </span>
                {p < 5 && <span style={{ opacity: 0.5 }}> · </span>}
              </span>
            )
          })}
          {participle && <span> + {participle}</span>}
        </div>
      )}
    </div>
  )
}
