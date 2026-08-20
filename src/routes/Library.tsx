import { Link } from 'react-router-dom'
import { units, library } from '@/lib/content'
import { coverage, useVocab } from '@/lib/vocab'

export default function Library() {
  const state = useVocab()

  return (
    <div className="pt-8">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>
        Learn Spanish by reading
      </h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        Each text builds only on words you have already met. Hover any word for its meaning, click
        it to mark what you know, and play the audio to hear it read at a beginner's pace.
      </p>

      {units.map((unit) => (
        <section key={unit.unit} className="mt-10">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>
              {unit.title}
            </h2>
            <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>
              {unit.level} · Unit {unit.unit}
            </span>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>{unit.focus.join(' · ')}</p>

          <ul className="mt-4 space-y-2">
            {unit.textIds.map((id) => {
              const t = library.find((x) => x.id === id)
              if (!t) return null
              const cov = Math.round(coverage(t.lemmas, state) * 100)
              return (
                <li key={id}>
                  <Link
                    to={`/read/${id}`}
                    className="block rounded-lg px-4 py-3 transition-colors"
                    style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium" style={{ fontFamily: 'var(--font-reading)' }}>{t.title}</span>
                      <span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {t.wordCount} words{t.hasAudio ? ' · audio' : ''}
                      </span>
                    </div>
                    <div className="mt-0.5 text-sm" style={{ color: 'var(--ink-soft)' }}>{t.titleEn}</div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded" style={{ background: 'var(--edge)' }}>
                        <div className="h-full rounded" style={{ width: `${cov}%`, background: 'var(--accent)' }} />
                      </div>
                      <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                        {cov}% known
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
