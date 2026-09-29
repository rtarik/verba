import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { units, library, readingOrder } from '@/lib/content'
import { coverage, useVocab } from '@/lib/vocab'
import { useProgress, type ProgressState } from '@/lib/progress'
import { unitVerbs } from '@/lib/practice'
import { TENSES, type TenseId } from '@engine/conjugate'

const LEVEL_NAMES: Record<string, string> = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Advanced',
}

/**
 * Which unit the reader is currently working through: the one holding the next
 * unread text, or the last written unit once everything is read. This is what
 * gets expanded on arrival.
 */
function activeUnitOf(read: ProgressState): number | undefined {
  const next = readingOrder.find((t) => !read[t.id])
  if (next) return units.find((u) => u.textIds.includes(next.id))?.unit
  return [...units].reverse().find((u) => u.textIds.length > 0)?.unit
}

/**
 * Expansion survives navigating into a text and back, but resets on reload —
 * at which point defaulting to the active unit is the right answer again.
 */
let expandedMemo: Set<number> | null = null

export default function Library() {
  const vocabState = useVocab()
  const read = useProgress()
  const [level, setLevel] = useState<string>('all')
  // On phones the index would push the "Continue" card below the fold, so it
  // collapses there. On wide screens it is a sidebar and always visible.
  const [indexOpen, setIndexOpen] = useState(false)

  const activeUnit = useMemo(() => activeUnitOf(read), [read])
  const [expanded, setExpanded] = useState<Set<number>>(
    () => expandedMemo ?? new Set(activeUnit ? [activeUnit] : [])
  )
  useEffect(() => { expandedMemo = expanded }, [expanded])

  const levels = useMemo(() => [...new Set(units.map((u) => u.level))], [])
  const shown = level === 'all' ? units : units.filter((u) => u.level === level)

  const next = readingOrder.find((t) => !read[t.id])
  const doneCount = readingOrder.filter((t) => read[t.id]).length

  const toggle = (n: number) =>
    setExpanded((prev) => {
      const s = new Set(prev)
      if (s.has(n)) s.delete(n)
      else s.add(n)
      return s
    })

  /** Sidebar click: reveal the unit and bring it into view. */
  const goToUnit = (n: number) => {
    setExpanded((prev) => new Set(prev).add(n))
    // Wait a frame so the section has expanded before measuring where it is.
    requestAnimationFrame(() =>
      document.getElementById(`unit-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-5 pt-8 lg:grid lg:grid-cols-[210px_1fr] lg:gap-10">
      {/* ---- sidebar: course index ------------------------------------- */}
      <aside className="lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto lg:pb-8">
        <button
          onClick={() => setIndexOpen((v) => !v)}
          aria-expanded={indexOpen}
          className="flex w-full items-center gap-1.5 text-[11px] uppercase tracking-wide lg:pointer-events-none"
          style={{ color: 'var(--accent)' }}
        >
          Course index
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
            className="lg:hidden transition-transform"
            style={{ transform: indexOpen ? 'rotate(90deg)' : 'none' }}
            aria-hidden="true"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
          <span className="ml-auto lg:hidden" style={{ color: 'var(--ink-soft)' }}>
            {units.filter((u) => u.textIds.length > 0).length} of {units.length} units ready
          </span>
        </button>
        <ol className={`${indexOpen ? 'grid' : 'hidden'} mt-2.5 grid-cols-2 gap-1 lg:grid lg:grid-cols-1`}>
          {units.map((u) => {
            const planned = u.textIds.length === 0
            const texts = u.textIds.map((id) => library.find((x) => x.id === id)).filter(Boolean)
            const done = texts.filter((t) => t && read[t.id]).length
            const isActive = u.unit === activeUnit
            return (
              <li key={u.unit}>
                <button
                  onClick={() => goToUnit(u.unit)}
                  className="flex w-full items-baseline gap-1.5 rounded px-2 py-1.5 text-left"
                  style={{
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                    opacity: planned ? 0.5 : 1,
                  }}
                >
                  <span className="w-4 shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{u.unit}</span>
                  <span
                    className="flex-1 truncate text-[13px]"
                    style={{ fontFamily: 'var(--font-reading)', color: isActive ? 'var(--accent)' : 'var(--ink)' }}
                  >
                    {u.title}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                    {planned ? '–' : `${done}/${texts.length}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </aside>

      {/* ---- main column ------------------------------------------------ */}
      <div className="mt-10 lg:mt-0">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>
          Learn Spanish by reading
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
          Each text builds only on words you have already met. Hover any word for its meaning, and
          play the audio to hear it read at a beginner's pace.
        </p>

        {next && (
          <Link
            to={`/read/${next.id}`}
            className="mt-6 block rounded-xl px-5 py-4"
            style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}
          >
            <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
              {doneCount === 0 ? 'Start here' : 'Continue'}
            </div>
            <div className="mt-1 text-lg font-medium" style={{ fontFamily: 'var(--font-reading)' }}>{next.title}</div>
            <div className="text-sm" style={{ color: 'var(--ink-soft)' }}>{next.titleEn}</div>
          </Link>
        )}

        <div className="mt-6 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded" style={{ background: 'var(--edge)' }}>
            <div className="h-full rounded" style={{ width: `${(doneCount / Math.max(1, readingOrder.length)) * 100}%`, background: 'var(--accent)' }} />
          </div>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>
            {doneCount}/{readingOrder.length} read
          </span>
        </div>

        {levels.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {['all', ...levels].map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className="rounded px-2.5 py-1 text-xs"
                style={level === l
                  ? { background: 'var(--accent)', color: 'var(--paper)' }
                  : { background: 'var(--accent-soft)', color: 'var(--ink-soft)' }}
              >
                {l === 'all' ? 'All' : `${l} · ${LEVEL_NAMES[l] ?? ''}`}
              </button>
            ))}
          </div>
        )}

        {shown.map((unit) => {
          const texts = unit.textIds.map((id) => library.find((x) => x.id === id)).filter(Boolean)
          const planned = texts.length === 0
          const unitDone = texts.filter((t) => t && read[t.id]).length
          const isOpen = expanded.has(unit.unit)

          return (
            <section key={unit.unit} id={`unit-${unit.unit}`} className="mt-6 scroll-mt-20">
              <button
                onClick={() => toggle(unit.unit)}
                aria-expanded={isOpen}
                className="flex w-full items-baseline gap-2 rounded-lg px-1 py-2 text-left"
              >
                <svg
                  width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  className="shrink-0 self-center transition-transform"
                  style={{
                    color: isOpen ? 'var(--accent)' : 'var(--ink-soft)',
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                  }}
                  aria-hidden="true"
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
                <span
                  className="text-lg font-semibold"
                  style={{ fontFamily: 'var(--font-reading)', opacity: planned ? 0.7 : 1 }}
                >
                  {unit.title}
                </span>
                <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {unit.level} · Unit {unit.unit}
                </span>
                {planned ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                  >
                    Coming soon
                  </span>
                ) : (
                  <span
                    className="ml-auto text-[11px] tabular-nums"
                    style={{ color: unitDone === texts.length ? 'var(--accent)' : 'var(--ink-soft)' }}
                  >
                    {unitDone}/{texts.length}
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="pl-6">
                  <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{unit.focus.join(' · ')}</p>

                  {planned ? (
                    <p
                      className="mt-3 rounded-lg px-4 py-3 text-sm leading-relaxed"
                      style={{ background: 'var(--surface)', border: '1px dashed var(--edge)', color: 'var(--ink-soft)' }}
                    >
                      {unit.summaryEn ?? 'Not written yet.'}
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {texts.map((t) => {
                        if (!t) return null
                        const cov = Math.round(coverage(t.lemmas, vocabState) * 100)
                        const isRead = Boolean(read[t.id])
                        return (
                          <li key={t.id}>
                            <Link
                              to={`/read/${t.id}`}
                              className="block rounded-lg px-4 py-3"
                              style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}
                            >
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="font-medium" style={{ fontFamily: 'var(--font-reading)' }}>
                                  {isRead && <span style={{ color: 'var(--accent)' }}>✓ </span>}
                                  {t.title}
                                </span>
                                <span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                                  {t.wordCount} words{t.hasAudio ? ' · audio' : ''}
                                </span>
                              </div>
                              <div className="mt-0.5 text-sm" style={{ color: 'var(--ink-soft)' }}>{t.titleEn}</div>
                              <div className="mt-2.5 flex items-center gap-2">
                                <div className="h-1 flex-1 overflow-hidden rounded" style={{ background: 'var(--edge)' }}>
                                  <div className="h-full rounded" style={{ width: `${cov}%`, background: 'var(--accent)' }} />
                                </div>
                                <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{cov}% known</span>
                              </div>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {!planned && unit.practice && (
                    <Link
                      to={`/practice?unit=${unit.unit}`}
                      className="mt-2 flex items-baseline justify-between gap-3 rounded-lg px-4 py-3"
                      style={{ background: 'var(--accent-soft)', border: '1px solid var(--edge)' }}
                    >
                      <span>
                        <span className="font-medium" style={{ fontFamily: 'var(--font-reading)' }}>Practice</span>
                        <span className="ml-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
                          {unit.practice.tenses.map((t) => TENSES[t as TenseId].name).join(' · ')}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {unitVerbs(unit.unit).length} verbs →
                      </span>
                    </Link>
                  )}
                </div>
              )}
            </section>
          )
        })}

        <p className="mt-12 text-xs" style={{ color: 'var(--ink-soft)' }}>
          {readingOrder.length} texts published · {units.filter((u) => u.textIds.length === 0).length} units in progress
        </p>
      </div>
    </div>
  )
}
