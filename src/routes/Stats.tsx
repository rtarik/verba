import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { lexicon, readingOrder } from '@/lib/content'
import { coverage, tally, useVocab, vocab, type Status } from '@/lib/vocab'
import { progress, useProgress, type ProgressState } from '@/lib/progress'

const COLORS: Record<Status, string> = {
  known: 'var(--accent)',
  unknown: 'var(--unknown-line)',
}
const FILTERS: Array<Status | 'all'> = ['all', 'unknown', 'known']

export default function Stats() {
  const state = useVocab()
  const readState = useProgress()
  const counts = tally(state)
  const fileInput = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<Status | 'all'>('unknown')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const totalInCorpus = Object.keys(lexicon).length
  const encountered = Object.keys(state).length

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.entries(lexicon)
      .map(([lemma, entry]) => ({ lemma, entry, rec: state[lemma] }))
      .filter(({ lemma, entry, rec }) => {
        const status: Status = rec?.status ?? 'unknown'
        if (filter !== 'all' && status !== filter) return false
        if (!q) return true
        return lemma.toLowerCase().includes(q) || entry.gloss.toLowerCase().includes(q)
      })
      .sort((a, b) => (b.rec?.seenCount ?? 0) - (a.rec?.seenCount ?? 0) || a.lemma.localeCompare(b.lemma))
  }, [state, filter, query])

  const download = () => {
    // Both stores travel together — exporting only vocabulary would quietly
    // drop which texts have been read.
    const blob = new Blob([vocab.exportJSON({ progress: readState })], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `verba-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const upload = async (file: File) => {
    try {
      const raw = await file.text()
      const { added, merged } = vocab.importJSON(raw)
      const parsed = JSON.parse(raw) as { progress?: ProgressState }
      if (parsed.progress) progress.replace({ ...readState, ...parsed.progress })
      setNotice(`Imported — ${added} new word${added === 1 ? '' : 's'}, ${merged} merged.`)
    } catch {
      setNotice('That file could not be read as a Verba backup.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>Progress</h1>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Words known', value: counts.known },
          { label: 'Still new', value: counts.unknown },
          { label: 'Texts read', value: `${Object.keys(readState).length}/${readingOrder.length}` },
        ].map((s) => (
          <div key={s.label} className="rounded-lg px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}>
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {encountered > 0 && (
        <div className="mt-4">
          <div className="flex h-2.5 overflow-hidden rounded" style={{ background: 'var(--edge)' }}>
            {(['known', 'unknown'] as Status[]).map((s) =>
              counts[s] ? <div key={s} style={{ width: `${(counts[s] / encountered) * 100}%`, background: COLORS[s] }} /> : null
            )}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            You have met {encountered} of the {totalInCorpus} words in the course.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            {(['known', 'unknown'] as Status[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[s] }} />
                {s} {counts[s]}
              </span>
            ))}
          </div>
        </div>
      )}

      <h2 className="mt-10 text-lg font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>Readiness by text</h2>
      <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
        How much of each text you already know. {counts.known > 0 ? 'Aim to read where this is high.' : 'Look words up as you read to fill this in.'}
      </p>
      <ul className="mt-4 space-y-2">
        {readingOrder.map((t) => {
          const cov = Math.round(coverage(t.lemmas, state) * 100)
          return (
            <li key={t.id} className="flex items-center gap-3">
              <Link to={`/read/${t.id}`} className="w-44 shrink-0 truncate text-sm" style={{ color: 'var(--accent)' }}>{t.title}</Link>
              <div className="h-1.5 flex-1 overflow-hidden rounded" style={{ background: 'var(--edge)' }}>
                <div className="h-full rounded" style={{ width: `${cov}%`, background: 'var(--accent)' }} />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>{cov}%</span>
            </li>
          )
        })}
      </ul>

      <h2 className="mt-10 text-lg font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>Vocabulary</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded px-2.5 py-1.5 text-xs capitalize"
            style={filter === f
              ? { background: 'var(--accent)', color: 'var(--paper)' }
              : { background: 'var(--accent-soft)', color: 'var(--ink-soft)' }}
          >
            {f}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          className="ml-auto rounded px-2.5 py-1.5 text-xs outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--edge)', color: 'var(--ink)' }}
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-lg" style={{ border: '1px solid var(--edge)' }}>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>Nothing here yet.</p>
        ) : (
          rows.slice(0, 200).map(({ lemma, entry, rec }, i) => (
            <div
              key={lemma}
              className="flex items-baseline gap-3 px-4 py-2"
              style={{ background: 'var(--surface)', borderTop: i ? '1px solid var(--edge)' : undefined }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[rec?.status ?? 'unknown'] }} />
              <span className="w-32 shrink-0 text-sm" style={{ fontFamily: 'var(--font-reading)' }}>{lemma}</span>
              <span className="flex-1 text-sm" style={{ color: 'var(--ink-soft)' }}>{entry.gloss}</span>
              <span className="shrink-0 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{entry.pos}</span>
            </div>
          ))
        )}
      </div>

      <h2 className="mt-10 text-lg font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>Your data</h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        Progress lives in this browser only — there is no account and no server. Clearing site data
        erases it, so export a copy now and then.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <button onClick={download} className="rounded px-3 py-1.5" style={{ background: 'var(--accent)', color: 'var(--paper)' }}>
          Export progress
        </button>
        <button onClick={() => fileInput.current?.click()} className="rounded px-3 py-1.5" style={{ background: 'var(--accent-soft)', color: 'var(--ink-soft)' }}>
          Import backup
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => {
            if (confirm('Erase all vocabulary and reading progress? This cannot be undone.')) {
              vocab.reset()
              progress.reset()
              setNotice('Progress cleared.')
            }
          }}
          className="rounded px-3 py-1.5"
          style={{ background: 'transparent', border: '1px solid var(--edge)', color: 'var(--ink-soft)' }}
        >
          Reset
        </button>
      </div>
      {notice && <p className="mt-3 text-xs" style={{ color: 'var(--accent)' }}>{notice}</p>}
    </div>
  )
}
