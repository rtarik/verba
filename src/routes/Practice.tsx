import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TENSES, type Person, type TenseId } from '@engine/conjugate'
import { explain, normalize, personLabel, type Prompt, type Verdict } from '@engine/check'
import { AccentInput, AccentKeys } from '@/components/AccentInput'
import { useGrammarProgress, useProgress } from '@/lib/progress'
import {
  buildSession, candidatePairs, sessionLength, checker, conj, displayInf, loadSettings, saveSettings,
  tensesByLevel, unitSettings, unlockPages, unlocked, verbByInf, verbs, type Item, type Settings, type Unlocked,
} from '@/lib/practice'
import { units } from '@/lib/content'

/** One answered item: what was typed and how each cell was marked. */
interface Answer {
  item: Item
  typed: string[]
  verdicts: Verdict[]
}

/** The item on screen: what has been typed, and its marks once checked. */
interface Draft {
  typed: string[]
  verdicts: Verdict[] | null
}

interface Session {
  settings: Settings
  items: Item[]
  answers: Answer[]
  draft: Draft
}

const emptyDraft = (item: Item | undefined): Draft => ({ typed: (item?.persons ?? []).map(() => ''), verdicts: null })
const newSession = (settings: Settings, items: Item[]): Session => ({ settings, items, answers: [], draft: emptyDraft(items[0]) })

/**
 * The session, down to the answer on screen, survives a trip to a grammar
 * page and back — the feedback links there — but not a reload.
 */
let sessionMemo: Session | null = null

function defaultSettings(open: Unlocked): Settings {
  // Start with the most advanced tenses the reading has reached.
  const level = [...tensesByLevel].reverse().find((l) => l.tenses.some((t) => open.tenses.has(t)))
  const tenses = level ? level.tenses.filter((t) => open.tenses.has(t)) : (['presente'] as TenseId[])
  return { mode: 'conjugate', tenses, pool: 'met', verb: '', everything: false }
}

export default function Practice() {
  const read = useProgress()
  const grammarRead = useGrammarProgress()
  const [settings, setSettings] = useState<Settings>(
    () => loadSettings() ?? defaultSettings(unlocked(read, grammarRead, false))
  )
  const open = useMemo(() => unlocked(read, grammarRead, settings.everything), [read, grammarRead, settings.everything])
  const [session, setSession] = useState<Session | null>(sessionMemo)

  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { sessionMemo = session }, [session])

  const start = (s: Settings) => {
    const items = buildSession(s, unlocked(read, grammarRead, s.everything))
    if (items.length) setSession(newSession(s, items))
  }

  // Arriving from a unit in the library (#/practice?unit=18) starts its set.
  // The parameter is dropped straight away, so going back to this page later
  // does not restart it.
  const [params, setParams] = useSearchParams()
  const unitParam = Number(params.get('unit'))
  useEffect(() => {
    if (!unitParam) return
    const s = unitSettings(unitParam)
    if (s) start(s)
    setParams({}, { replace: true })
  }, [unitParam])

  if (!session) return <Setup settings={settings} setSettings={setSettings} open={open} onStart={() => start(settings)} />

  const done = session.answers.length >= session.items.length
  if (done) {
    const misses = session.answers.filter((a) => a.verdicts.some((v) => v.result === 'wrong')).map((a) => a.item)
    return (
      <Summary
        session={session}
        onRetry={misses.length ? () => setSession(newSession(session.settings, misses)) : undefined}
        onAgain={() => start(session.settings)}
        onSettings={() => setSession(null)}
      />
    )
  }

  const n = session.answers.length
  const item = session.items[n]
  const setDraft = (draft: Draft) => setSession({ ...session, draft })
  const next = () => {
    const { typed, verdicts } = session.draft
    if (!verdicts) return
    setSession({
      ...session,
      answers: [...session.answers, { item, typed, verdicts }],
      draft: emptyDraft(session.items[n + 1]),
    })
  }

  const unit = session.settings.unit ? units.find((u) => u.unit === session.settings.unit) : undefined

  return (
    <div className="mx-auto max-w-2xl px-5 pt-8">
      {unit && (
        <div className="mb-3 text-xs" style={{ color: 'var(--ink-soft)' }}>
          Unit {unit.unit} practice · <span style={{ fontFamily: 'var(--font-reading)', color: 'var(--ink)' }}>{unit.title}</span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded" style={{ background: 'var(--edge)' }}>
          <div className="h-full rounded" style={{ width: `${(n / session.items.length) * 100}%`, background: 'var(--accent)' }} />
        </div>
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{n + 1}/{session.items.length}</span>
        <button onClick={() => setSession(null)} className="text-xs" style={{ color: 'var(--ink-soft)' }}>End</button>
      </div>
      {session.settings.mode === 'table'
        ? <TableCard key={n} item={item} draft={session.draft} setDraft={setDraft} onNext={next} />
        : <ConjugateCard key={n} item={item} draft={session.draft} setDraft={setDraft} onNext={next} />}
    </div>
  )
}

/* ---- setup -------------------------------------------------------------- */

function Chip({ on, locked, title, onClick, children }: { on: boolean; locked?: boolean; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      title={title}
      className="rounded px-2.5 py-1.5 text-xs"
      style={
        locked
          ? { border: '1px dashed var(--edge)', color: 'var(--ink-soft)', opacity: 0.6, cursor: 'not-allowed' }
          : on
            ? { background: 'var(--accent)', color: 'var(--paper)' }
            : { background: 'var(--accent-soft)', color: 'var(--ink-soft)' }
      }
    >
      {children}
    </button>
  )
}

function Setup({ settings, setSettings, open, onStart }: {
  settings: Settings
  setSettings: (s: Settings) => void
  open: Unlocked
  onStart: () => void
}) {
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })
  const toggleTense = (t: TenseId) =>
    set({ tenses: settings.tenses.includes(t) ? settings.tenses.filter((x) => x !== t) : [...settings.tenses, t] })
  const pairs = useMemo(() => candidatePairs(settings, open), [settings, open])
  const length = sessionLength(settings.mode, pairs)
  const [verbText, setVerbText] = useState(settings.verb ? displayInf(settings.verb) : '')

  const chooseVerb = (text: string) => {
    setVerbText(text)
    const t = normalize(text)
    const inf = verbByInf.has(t) ? t : verbByInf.has(t.replace(/se$/, '')) ? t.replace(/se$/, '') : ''
    set({ verb: inf })
  }

  return (
    <div className="mx-auto max-w-2xl px-5 pt-8">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>Practice</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        Conjugation drills built from the verbs in your texts. Tenses open as you read their grammar
        pages, and verbs as you read the texts that introduce them.
      </p>

      <h2 className="mt-7 text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Drill</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip on={settings.mode === 'conjugate'} onClick={() => set({ mode: 'conjugate' })}>Conjugate · one form at a time</Chip>
        <Chip on={settings.mode === 'table'} onClick={() => set({ mode: 'table' })}>Full table · all six persons</Chip>
      </div>

      <div className="mt-7 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Tenses</h2>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={settings.everything} onChange={(e) => set({ everything: e.target.checked })} />
          Show everything
        </label>
      </div>
      <div className="mt-2 space-y-2.5">
        {tensesByLevel.map(({ level, tenses }) => (
          <div key={level} className="flex items-baseline gap-1.5">
            <span className="w-7 shrink-0 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{level}</span>
            <div className="flex flex-wrap gap-1.5">
            {tenses.map((t) => {
              const locked = !open.tenses.has(t)
              const page = unlockPages(t)[0]
              return (
                <Chip
                  key={t}
                  on={settings.tenses.includes(t)}
                  locked={locked}
                  title={locked && page ? `Read “${page.title}” to unlock` : TENSES[t].en}
                  onClick={() => toggleTense(t)}
                >
                  {locked && '🔒 '}{TENSES[t].name}
                </Chip>
              )
            })}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-7 text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>Verbs</h2>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Chip on={settings.pool === 'met'} onClick={() => set({ pool: 'met' })}>
          All verbs you have met <span className="tabular-nums opacity-70">{open.verbs.size}</span>
        </Chip>
        <Chip on={settings.pool === 'irregular'} onClick={() => set({ pool: 'irregular' })}>Irregular and stem-changing only</Chip>
        <Chip on={settings.pool === 'one'} onClick={() => set({ pool: 'one' })}>One verb</Chip>
        {settings.pool === 'one' && (
          <>
            <input
              list="practice-verbs"
              value={verbText}
              onChange={(e) => chooseVerb(e.target.value)}
              placeholder="e.g. tener"
              lang="es"
              autoCapitalize="off"
              className="w-36 rounded px-2.5 py-1.5 text-xs outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--edge)', color: 'var(--ink)' }}
            />
            <datalist id="practice-verbs">
              {verbs.filter((v) => open.verbs.has(v.inf)).map((v) => <option key={v.inf} value={displayInf(v.inf)}>{v.gloss}</option>)}
            </datalist>
          </>
        )}
      </div>
      {settings.pool === 'one' && verbText && !settings.verb && (
        <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>No course verb “{verbText}”.</p>
      )}
      {settings.pool === 'one' && settings.verb && !open.verbs.has(settings.verb) && (
        <p className="mt-2 text-xs" style={{ color: 'var(--ink-soft)' }}>You have not met “{displayInf(settings.verb)}” in a text yet — tick “Show everything” to drill it anyway.</p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          onClick={onStart}
          disabled={!pairs.length}
          className="rounded-lg px-5 py-2.5 text-sm font-medium"
          style={pairs.length
            ? { background: 'var(--accent)', color: 'var(--paper)' }
            : { background: 'var(--edge)', color: 'var(--ink-soft)', cursor: 'not-allowed' }}
        >
          Start{pairs.length > 0 && ` · ${length} ${settings.mode === 'table' ? (length === 1 ? 'table' : 'tables') : (length === 1 ? 'form' : 'forms')}`}
        </button>
        <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
          {pairs.length
            ? `Drawn from ${pairs.length} verb–tense combinations`
            : settings.tenses.some((t) => open.tenses.has(t)) ? 'Nothing matches these settings.' : 'Pick at least one tense.'}
        </span>
      </div>

      <p className="mt-10 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        Type accents as a' → á, n~ → ñ, u: → ü, or use the buttons. A missing accent counts as right,
        with a warning — unless the accent is what tells two forms apart, as in <i>hablo</i> / <i>habló</i>.
      </p>
    </div>
  )
}

/* ---- drills ------------------------------------------------------------- */

const VERDICT_STYLE = {
  correct: { color: 'var(--good)', background: 'var(--good-bg)', label: 'Correct' },
  accent: { color: 'var(--learning)', background: 'var(--learning-bg)', label: 'Right — watch the accent' },
  wrong: { color: 'var(--bad)', background: 'var(--bad-bg)', label: 'Not quite' },
} as const

function PromptHeader({ item }: { item: Item }) {
  const v = verbByInf.get(item.inf)
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
        {TENSES[item.tense].name} <span style={{ color: 'var(--ink-soft)' }}>· {TENSES[item.tense].en}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
        <span className="text-3xl" style={{ fontFamily: 'var(--font-reading)' }}>{displayInf(item.inf)}</span>
        {v && <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{v.gloss}</span>}
      </div>
    </div>
  )
}

/** Why an answer was wrong, and where to read up on it. */
function Why({ prompt, typed, verdict }: { prompt: Prompt; typed: string; verdict: Verdict }) {
  if (verdict.result !== 'wrong') return null
  const { text, ref } = explain(verdict.diagnosis, prompt, normalize(typed), verdict.expected)
  return (
    <span>
      {text}{' '}
      <Link to={`/grammar/${ref}`} style={{ color: 'var(--accent)' }}>See the table →</Link>
    </span>
  )
}

function ConjugationTable({ item, highlight }: { item: Item; highlight: Person[] }) {
  const rows = conj.table(item.inf, item.tense, { refl: item.refl })
  return (
    <table className="mt-3 w-full text-sm">
      <tbody>
        {rows.map((forms, p) =>
          forms.length === 0 ? null : (
            <tr key={p} style={{ background: highlight.includes(p as Person) ? 'var(--accent-soft)' : undefined }}>
              <td className="w-40 py-1 pl-2 pr-3 text-xs" style={{ color: 'var(--ink-soft)' }}>{personLabel(item.tense, p as Person)}</td>
              <td className="py-1 pr-2" style={{ fontFamily: 'var(--font-reading)' }}>{forms.join(' / ')}</td>
            </tr>
          )
        )}
      </tbody>
    </table>
  )
}

interface CardProps {
  item: Item
  draft: Draft
  setDraft: (d: Draft) => void
  onNext: () => void
}

function ConjugateCard({ item, draft, setDraft, onNext }: CardProps) {
  const typed = draft.typed[0] ?? ''
  const verdict = draft.verdicts?.[0] ?? null
  const [showTable, setShowTable] = useState(false)
  const setTyped = (v: string) => setDraft({ typed: [v], verdicts: null })

  const submit = () => {
    if (verdict) return onNext()
    if (typed.trim()) setDraft({ typed: [typed], verdicts: [checker.check(item, typed)] })
  }
  const style = verdict ? VERDICT_STYLE[verdict.result] : null

  return (
    <div className="mt-6 rounded-xl px-5 py-5" style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}>
      <PromptHeader item={item} />
      <div className="mt-5 text-sm" style={{ color: 'var(--ink-soft)' }}>{personLabel(item.tense, item.person)}</div>
      <AccentInput
        autoFocus
        value={typed}
        onChange={setTyped}
        onEnter={submit}
        readOnly={Boolean(verdict)}
        ariaLabel="Your answer"
        className="mt-1.5 w-full rounded-lg px-3 py-2.5 text-lg outline-none"
        style={{
          fontFamily: 'var(--font-reading)',
          background: style?.background ?? 'var(--paper)',
          border: `1px solid ${style?.color ?? 'var(--edge)'}`,
          color: 'var(--ink)',
        }}
      />
      {!verdict && <div className="mt-3"><AccentKeys /></div>}

      {verdict && style && (
        <div className="mt-3 text-sm leading-relaxed">
          <span className="font-medium" style={{ color: style.color }}>{style.label}</span>
          {verdict.result !== 'correct' && (
            <span> — <span style={{ fontFamily: 'var(--font-reading)', fontSize: '1.05rem' }}>{verdict.expected}</span></span>
          )}
          <div className="mt-1" style={{ color: 'var(--ink-soft)' }}>
            <Why prompt={item} typed={typed} verdict={verdict} />
          </div>
          <button onClick={() => setShowTable((v) => !v)} className="mt-2 text-xs" style={{ color: 'var(--accent)' }}>
            {showTable ? 'Hide' : 'Show'} the full table
          </button>
          {showTable && <ConjugationTable item={item} highlight={[item.person]} />}
        </div>
      )}

      <button
        onClick={submit}
        className="mt-5 rounded-lg px-4 py-2 text-sm"
        style={{ background: 'var(--accent)', color: 'var(--paper)' }}
      >
        {verdict ? 'Next ↵' : 'Check ↵'}
      </button>
    </div>
  )
}

function TableCard({ item, draft, setDraft, onNext }: CardProps) {
  const { typed, verdicts } = draft
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const setTyped = (next: string[]) => setDraft({ typed: next, verdicts: null })

  const check = () => setDraft({ typed, verdicts: item.persons.map((person, i) => checker.check({ ...item, person }, typed[i])) })
  const enter = (i: number) => {
    if (verdicts) return onNext()
    if (i < item.persons.length - 1) inputs.current[i + 1]?.focus()
    else check()
  }

  return (
    <div className="mt-6 rounded-xl px-5 py-5" style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}>
      <PromptHeader item={item} />
      <div className="mt-5 space-y-2">
        {item.persons.map((person, i) => {
          const v = verdicts?.[i]
          const style = v ? VERDICT_STYLE[v.result] : null
          return (
            <div key={person}>
              <div className="flex items-center gap-3">
                <label className="w-24 shrink-0 text-xs sm:w-40" style={{ color: 'var(--ink-soft)' }}>{personLabel(item.tense, person)}</label>
                <AccentInput
                  ref={(el) => { inputs.current[i] = el }}
                  autoFocus={i === 0}
                  value={typed[i]}
                  onChange={(val) => setTyped(typed.map((x, j) => (j === i ? val : x)))}
                  onEnter={() => enter(i)}
                  readOnly={Boolean(verdicts)}
                  ariaLabel={personLabel(item.tense, person)}
                  className="min-w-0 flex-1 rounded px-2.5 py-1.5 outline-none"
                  style={{
                    fontFamily: 'var(--font-reading)',
                    background: style?.background ?? 'var(--paper)',
                    border: `1px solid ${style?.color ?? 'var(--edge)'}`,
                    color: 'var(--ink)',
                  }}
                />
              </div>
              {v && v.result !== 'correct' && (
                <div className="mt-0.5 pl-[6.75rem] text-xs leading-relaxed sm:pl-[10.75rem]" style={{ color: 'var(--ink-soft)' }}>
                  <span style={{ color: VERDICT_STYLE[v.result].color, fontFamily: 'var(--font-reading)', fontSize: '.9rem' }}>{v.expected}</span>
                  {v.result === 'wrong' && <> · <Why prompt={{ ...item, person }} typed={typed[i]} verdict={v} /></>}
                  {v.result === 'accent' && ' · watch the accent'}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!verdicts && <div className="mt-4"><AccentKeys /></div>}
      <button
        onClick={() => (verdicts ? onNext() : check())}
        className="mt-5 rounded-lg px-4 py-2 text-sm"
        style={{ background: 'var(--accent)', color: 'var(--paper)' }}
      >
        {verdicts ? 'Next ↵' : 'Check all'}
      </button>
    </div>
  )
}

/* ---- summary ------------------------------------------------------------ */

function Summary({ session, onRetry, onAgain, onSettings }: {
  session: Session
  onRetry?: () => void
  onAgain: () => void
  onSettings: () => void
}) {
  const cells = session.answers.flatMap((a) => a.verdicts)
  const right = cells.filter((v) => v.result !== 'wrong').length
  const accents = cells.filter((v) => v.result === 'accent').length
  const wrong = cells.length - right
  const review = session.answers
    .map((a) => ({ a, misses: a.verdicts.flatMap((v, i) => (v.result === 'wrong' ? [{ v, person: a.item.persons[i], typed: a.typed[i] }] : [])) }))
    .filter((r) => r.misses.length > 0)

  return (
    <div className="mx-auto max-w-2xl px-5 pt-8">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>
        {right === cells.length ? '¡Perfecto!' : right >= cells.length * 0.8 ? '¡Muy bien!' : 'Sigue practicando'}
      </h1>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Right', value: `${right}/${cells.length}` },
          { label: 'Accents to watch', value: accents },
          { label: 'Wrong', value: wrong },
        ].map((s) => (
          <div key={s.label} className="rounded-lg px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}>
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {review.length > 0 && (
        <>
          <h2 className="mt-8 text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>To review</h2>
          <ul className="mt-2 overflow-hidden rounded-lg" style={{ border: '1px solid var(--edge)' }}>
            {review.map(({ a, misses }, i) => (
              <li key={i} className="px-4 py-2.5 text-sm" style={{ background: 'var(--surface)', borderTop: i ? '1px solid var(--edge)' : undefined }}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span style={{ fontFamily: 'var(--font-reading)' }}>{displayInf(a.item.inf)}</span>
                  <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{TENSES[a.item.tense].name}</span>
                </div>
                {misses.map(({ v, person, typed }) => (
                  <div key={person} className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                    <span className="w-28 shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>{personLabel(a.item.tense, person)}</span>
                    <span style={{ fontFamily: 'var(--font-reading)' }}>
                      <s style={{ color: 'var(--bad)' }}>{typed || '—'}</s> → <span style={{ color: 'var(--good)' }}>{v.expected}</span>
                    </span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8 flex flex-wrap gap-2 text-sm">
        {onRetry && (
          <button onClick={onRetry} className="rounded-lg px-4 py-2" style={{ background: 'var(--accent)', color: 'var(--paper)' }}>
            Retry the misses
          </button>
        )}
        <button
          onClick={onAgain}
          className="rounded-lg px-4 py-2"
          style={onRetry ? { background: 'var(--accent-soft)', color: 'var(--ink)' } : { background: 'var(--accent)', color: 'var(--paper)' }}
        >
          New set
        </button>
        <button onClick={onSettings} className="rounded-lg px-4 py-2" style={{ border: '1px solid var(--edge)', color: 'var(--ink-soft)' }}>
          Change settings
        </button>
      </div>
    </div>
  )
}
