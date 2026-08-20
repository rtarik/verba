import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { grammarDocs, grammarById, textsUsingGrammar } from '@/lib/content'

export default function Grammar() {
  const { id } = useParams()
  const doc = id ? grammarById(id) : null

  if (id && !doc) {
    return (
      <div className="pt-16 text-center">
        <p style={{ color: 'var(--ink-soft)' }}>No grammar page called “{id}”.</p>
        <Link to="/grammar" className="mt-3 inline-block text-sm" style={{ color: 'var(--accent)' }}>← All topics</Link>
      </div>
    )
  }

  if (doc) {
    const used = textsUsingGrammar(doc.id)
    return (
      <article className="pt-8">
        <Link to="/grammar" className="text-xs" style={{ color: 'var(--ink-soft)' }}>← All topics</Link>
        <h1 className="mt-3 text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>{doc.title}</h1>
        <div className="prose-grammar mt-5 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown>
        </div>

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
            {doc.related.map((r, i) => {
              const d = grammarById(r)
              return d ? (
                <span key={r}>
                  {i > 0 && ', '}
                  <Link to={`/grammar/${r}`} style={{ color: 'var(--accent)' }}>{d.title}</Link>
                </span>
              ) : null
            })}
          </p>
        )}
      </article>
    )
  }

  return (
    <div className="pt-8">
      <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>Grammar</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
        Reference pages written for someone who has never studied grammar before. Every example
        uses words from texts you have already read.
      </p>
      <ul className="mt-6 space-y-2">
        {grammarDocs.map((d) => (
          <li key={d.id}>
            <Link
              to={`/grammar/${d.id}`}
              className="block rounded-lg px-4 py-3"
              style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium" style={{ fontFamily: 'var(--font-reading)' }}>{d.title}</span>
                <span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{d.level}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
