import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { grammarDocs, grammarByCategory, grammarById, textsUsingGrammar } from '@/lib/content'
import { grammarProgress, useGrammarProgress } from '@/lib/progress'

export default function Grammar() {
  const { id } = useParams()
  const doc = id ? grammarById(id) : null
  const [query, setQuery] = useState('')
  const readState = useGrammarProgress()

  // Opening a reference page and staying on it counts as having read it.
  // The delay keeps a mis-click, or a bounce through on the way somewhere
  // else, from silently marking the page done.
  useEffect(() => {
    if (!doc) return
    const t = window.setTimeout(() => grammarProgress.markRead(doc.id), 2500)
    return () => window.clearTimeout(t)
  }, [doc?.id])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return grammarByCategory
    return grammarByCategory
      .map((g) => ({ category: g.category, docs: g.docs.filter((d) => d.title.toLowerCase().includes(q) || d.id.includes(q)) }))
      .filter((g) => g.docs.length > 0)
  }, [query])

  if (id && !doc) {
    return (
      <div className="mx-auto max-w-3xl px-5 pt-16 text-center">
        <p style={{ color: 'var(--ink-soft)' }}>No grammar page called “{id}”.</p>
        <Link to="/grammar" className="mt-3 inline-block text-sm" style={{ color: 'var(--accent)' }}>← All topics</Link>
      </div>
    )
  }

  if (doc) {
    const used = textsUsingGrammar(doc.id)
    const siblings = grammarByCategory.find((g) => g.category === doc.category)?.docs ?? []
    const i = siblings.findIndex((d) => d.id === doc.id)

    return (
      <article className="mx-auto max-w-3xl px-5 pt-8">
        <Link to="/grammar" className="text-xs" style={{ color: 'var(--ink-soft)' }}>← All topics</Link>
        <div className="mt-3 flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>{doc.title}</h1>
          <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{doc.category} · {doc.level}</span>
        </div>

        <div className="prose-grammar mt-5 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
        </div>

        <button
          onClick={() => grammarProgress.toggle(doc.id)}
          className="mt-8 rounded px-3 py-1.5 text-xs"
          style={readState[doc.id]
            ? { background: 'var(--accent-soft)', color: 'var(--accent)' }
            : { border: '1px solid var(--edge)', color: 'var(--ink-soft)' }}
        >
          {readState[doc.id] ? '✓ Read' : 'Mark as read'}
        </button>

        {used.length > 0 && (
          <div className="mt-10 rounded-xl px-5 py-4" style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}>
            <h2 className="text-sm font-semibold">Practise it in</h2>
            <ul className="mt-2 space-y-1">
              {used.map((t) => (
                <li key={t.id}>
                  <Link to={`/read/${t.id}`} className="text-sm" style={{ color: 'var(--accent)' }}>{t.title}</Link>
                  <span className="ml-2 text-xs" style={{ color: 'var(--ink-soft)' }}>{t.titleEn}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {doc.related.length > 0 && (
          <p className="mt-6 text-sm" style={{ color: 'var(--ink-soft)' }}>
            See also{' '}
            {doc.related.map((r, n) => {
              const d = grammarById(r)
              return d ? (
                <span key={r}>{n > 0 && ', '}<Link to={`/grammar/${r}`} style={{ color: 'var(--accent)' }}>{d.title}</Link></span>
              ) : null
            })}
          </p>
        )}

        <nav className="mt-8 flex justify-between text-sm">
          {i > 0 ? <Link to={`/grammar/${siblings[i - 1].id}`} style={{ color: 'var(--accent)' }}>← {siblings[i - 1].title}</Link> : <span />}
          {i >= 0 && i < siblings.length - 1
            ? <Link to={`/grammar/${siblings[i + 1].id}`} style={{ color: 'var(--accent)' }}>{siblings[i + 1].title} →</Link>
            : <span />}
        </nav>
      </article>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-5 pt-8">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>Grammar</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        Reference pages written for someone who has never studied grammar before. Every example
        uses words from texts you have already read.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search topics…"
        className="mt-5 w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: 'var(--surface)', border: '1px solid var(--edge)', color: 'var(--ink)' }}
      />

      {groups.length === 0 && (
        <p className="mt-8 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>
          Nothing matches “{query}”.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.category} className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{g.category}</h2>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--ink-soft)' }}>
              {g.docs.filter((d) => readState[d.id]).length}/{g.docs.length} read
            </span>
          </div>
          <ul className="mt-2.5 space-y-2">
            {g.docs.map((d) => {
              const isRead = Boolean(readState[d.id])
              return (
                <li key={d.id}>
                  <Link
                    to={`/grammar/${d.id}`}
                    className="flex items-baseline justify-between gap-3 rounded-lg py-3 pr-4"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--edge)',
                      // A thick left edge marks a page already read. Unread
                      // pages keep an edge of the same width in the border
                      // colour, so nothing shifts sideways between states.
                      borderLeft: `3px solid ${isRead ? 'var(--accent)' : 'var(--edge)'}`,
                      paddingLeft: 'calc(1rem - 2px)',
                    }}
                  >
                    <span className="flex items-baseline gap-2">
                      <span
                        className="w-3 shrink-0 text-xs"
                        style={{ color: 'var(--accent)', opacity: isRead ? 1 : 0 }}
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                      <span
                        className="font-medium"
                        style={{ fontFamily: 'var(--font-reading)', color: isRead ? 'var(--ink-soft)' : 'var(--ink)' }}
                      >
                        {d.title}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs" style={{ color: 'var(--ink-soft)' }}>{d.level}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <p className="mt-8 text-xs" style={{ color: 'var(--ink-soft)' }}>
        {grammarDocs.length} topics · {Object.keys(readState).length} read
      </p>
    </div>
  )
}
