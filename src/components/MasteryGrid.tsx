/**
 * Conjugation mastery as a tense × person grid.
 *
 * One hue, light to dark, for recent accuracy (a sequential scale: the status
 * greens and reds stay reserved for marking answers). Unpractised cells are
 * outlined rather than filled, so "not tried" never reads as "bad". Hover or
 * focus shows a cell's numbers; clicking drills it.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DRILL_TENSES, PERSONS, TENSES, isCommand, type Person, type TenseId } from '@engine/conjugate'
import { personLabel, type Regularity } from '@engine/check'
import { cellKey, parseCellKey, score, useMastery, type CellRecord } from '@/lib/mastery'

type Filter = Regularity | 'all'
const FILTERS: Array<[Filter, string]> = [
  ['all', 'All verbs'],
  ['regular', 'Regular'],
  ['spelling', 'Spelling changes'],
  ['stem', 'Stem changes'],
  ['irregular', 'Irregular'],
]
const REGS: Regularity[] = ['regular', 'spelling', 'stem', 'irregular']
const REG_NAMES: Record<Regularity, string> = { regular: 'regular', spelling: 'spelling-change', stem: 'stem-changing', irregular: 'irregular' }

const COLUMNS = ['yo', 'tú', 'él · usted', 'nosotros', 'vosotros', 'ellos · ustedes']

/** Five steps of the accent over the surface, lightest = least accurate. */
const STEPS = [14, 32, 52, 74, 96]
const stepOf = (s: number) => Math.min(STEPS.length - 1, Math.floor(s * STEPS.length))
const fill = (step: number) => `color-mix(in srgb, var(--accent) ${STEPS[step]}%, var(--surface))`

interface Agg {
  attempts: number
  score: number
  lastSeen: string
}

function aggregate(recs: CellRecord[]): Agg | null {
  const attempts = recs.reduce((n, r) => n + r.attempts, 0)
  if (!attempts) return null
  return {
    attempts,
    score: recs.reduce((n, r) => n + score(r) * r.attempts, 0) / attempts,
    lastSeen: recs.map((r) => r.lastSeen).sort().at(-1)!,
  }
}

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function MasteryGrid() {
  const { cells } = useMastery()
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [focus, setFocus] = useState<{ tense: TenseId; person: Person } | null>(null)

  const cellAt = (tense: TenseId, person: Person): Agg | null => {
    const regs = filter === 'all' ? REGS : [filter]
    return aggregate(regs.map((r) => cells[cellKey(tense, person, r)]).filter((r): r is CellRecord => Boolean(r)))
  }

  const totals = useMemo(() => {
    const recs = Object.entries(cells)
    const answers = recs.reduce((n, [, r]) => n + r.attempts, 0)
    // Weakest: lowest score among cells with enough answers to mean something.
    const weakest = recs
      .filter(([, r]) => r.attempts >= 3)
      .map(([k, r]) => ({ ...parseCellKey(k), s: score(r) }))
      .sort((a, b) => a.s - b.s)
      .slice(0, 3)
      .filter((w) => w.s < 0.8)
    return { answers, practised: recs.length, weakest }
  }, [cells])

  const drill = (tense: TenseId, person: Person) =>
    navigate(`/practice?cell=${tense}.${person}${filter === 'all' ? '' : `.${filter}`}`)

  const describe = (tense: TenseId, person: Person) => {
    const a = cellAt(tense, person)
    const kind = filter === 'all' ? '' : ` · ${REG_NAMES[filter]} verbs`
    const head = `${TENSES[tense].name} · ${personLabel(tense, person)}${kind}`
    return a
      ? `${head} — ${Math.round(a.score * 100)}% recent accuracy over ${a.attempts} answer${a.attempts === 1 ? '' : 's'}, last practised ${fmtDate(a.lastSeen)}. Click to practise.`
      : `${head} — not practised yet. Click to practise.`
  }

  if (!totals.answers) {
    return (
      <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Nothing practised yet. <Link to="/practice" style={{ color: 'var(--accent)' }}>Start a drill →</Link> and every answer
        fills in a grid here, showing where your conjugation is solid and where it slips.
      </p>
    )
  }

  return (
    <div>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
        {totals.answers} answers across {totals.practised} tense–person–verb-type cells.
        {totals.weakest.length > 0 && (
          <> Weakest: {totals.weakest.map((w, i) => (
            <span key={i}>{i > 0 && ', '}<i>{TENSES[w.tense].name}</i> {personLabel(w.tense, w.person)} ({REG_NAMES[w.reg]})</span>
          ))}.</>
        )}
      </p>
      <Link
        to="/practice?weak=1"
        className="mt-3 inline-block rounded px-3 py-1.5 text-xs"
        style={{ background: 'var(--accent)', color: 'var(--paper)' }}
      >
        Practise weak spots →
      </Link>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded px-2.5 py-1.5 text-xs"
            style={filter === f
              ? { background: 'var(--accent)', color: 'var(--paper)' }
              : { background: 'var(--accent-soft)', color: 'var(--ink-soft)' }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full table-fixed border-separate text-xs" style={{ borderSpacing: 2, minWidth: 560 }} onMouseLeave={() => setFocus(null)}>
          <colgroup>
            <col style={{ width: '13rem' }} />
            {PERSONS.map((p) => <col key={p} />)}
          </colgroup>
          <thead>
            <tr>
              <th />
              {COLUMNS.map((c) => (
                <th key={c} className="truncate pb-1 text-center font-normal" style={{ color: 'var(--ink-soft)' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DRILL_TENSES.map((tense) => (
              <tr key={tense}>
                <th scope="row" className="truncate pr-2 text-left font-normal" style={{ color: 'var(--ink)' }}>
                  {TENSES[tense].name}
                </th>
                {PERSONS.map((person) => {
                  if (isCommand(tense) && person === 0) return <td key={person} />
                  const a = cellAt(tense, person)
                  const step = a ? stepOf(a.score) : -1
                  const on = focus?.tense === tense && focus.person === person
                  return (
                    <td key={person} className="p-0">
                      <button
                        onClick={() => drill(tense, person)}
                        onMouseEnter={() => setFocus({ tense, person })}
                        onFocus={() => setFocus({ tense, person })}
                        onBlur={() => setFocus(null)}
                        aria-label={describe(tense, person)}
                        className="block h-7 w-full rounded"
                        style={{
                          background: a ? fill(step) : 'transparent',
                          border: a ? '1px solid transparent' : '1px dashed var(--edge)',
                          outline: on ? '2px solid var(--ink)' : 'none',
                          outlineOffset: 1,
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 min-h-[2.5em] text-xs leading-relaxed" style={{ color: focus ? 'var(--ink)' : 'var(--ink-soft)' }} aria-live="polite">
        {focus ? describe(focus.tense, focus.person) : 'Point at a cell for its numbers; click it to practise just that.'}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        <span className="flex items-center gap-1.5">
          Recent accuracy
          <span>0%</span>
          <span className="flex gap-0.5">
            {STEPS.map((_, i) => <span key={i} className="h-3 w-5 rounded-sm" style={{ background: fill(i) }} />)}
          </span>
          <span>100%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm" style={{ border: '1px dashed var(--edge)' }} />
          not practised
        </span>
      </div>
    </div>
  )
}
