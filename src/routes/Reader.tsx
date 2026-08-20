import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Text } from '@content/schema'
import { loadText, assetUrl, neighbours, grammarById } from '@/lib/content'
import { useAudioSync } from '@/lib/useAudioSync'
import { coverage, useVocab, vocab } from '@/lib/vocab'
import { progress, useProgress } from '@/lib/progress'
import { TextBody } from '@/components/TextBody'
import { Player } from '@/components/Player'

const SIZES = [17, 19, 21, 24]

export default function Reader() {
  const { id = '' } = useParams()
  const [text, setText] = useState<Text | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [fontSize, setFontSize] = useState(19)

  const vocabState = useVocab()
  const readState = useProgress()
  const isRead = Boolean(readState[id])

  const markRead = useCallback(() => {
    if (!text) return
    const lemmas = [...new Set(text.tokens.flatMap((x) => (x.k === 'w' && x.pos !== 'name' ? [x.lemma] : [])))]
    progress.markRead(id, coverage(lemmas, vocabState))
  }, [text, id, vocabState])

  const audio = useAudioSync(text, markRead)

  useEffect(() => {
    let live = true
    setText(null)
    setError(null)
    loadText(id)
      .then((t) => {
        if (!live) return
        setText(t)
        // Encountering a word counts even before you judge whether you know it.
        vocab.markSeen(t.tokens.flatMap((x) => (x.k === 'w' && x.pos !== 'name' ? [x.lemma] : [])))
      })
      .catch(() => live && setError(`No text found for "${id}".`))
    return () => {
      live = false
    }
  }, [id])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-5 pt-16 text-center">
        <p style={{ color: 'var(--ink-soft)' }}>{error}</p>
        <Link to="/" className="mt-3 inline-block text-sm" style={{ color: 'var(--accent)' }}>← Back to the library</Link>
      </div>
    )
  }
  if (!text) return <div className="mx-auto max-w-3xl px-5 pt-16 text-center text-sm" style={{ color: 'var(--ink-soft)' }}>Loading…</div>

  const { prev, next } = neighbours(id)

  return (
    <article className="mx-auto max-w-3xl px-5 pt-8">
      <Link to="/" className="text-xs" style={{ color: 'var(--ink-soft)' }}>← Library</Link>

      <header className="mt-3">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-reading)' }}>{text.title}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--ink-soft)' }}>{text.titleEn}</p>
        <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{text.blurbEn}</p>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setShowTranslation((v) => !v)}
          className="rounded px-2.5 py-1.5"
          style={{ background: 'var(--accent-soft)', color: 'var(--ink-soft)' }}
        >
          {showTranslation ? 'Hide translation' : 'Show translation'}
        </button>
        {text.grammarRefs.map((ref) => {
          const doc = grammarById(ref)
          return doc ? (
            <Link key={ref} to={`/grammar/${ref}`} className="rounded px-2.5 py-1.5" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              {doc.title}
            </Link>
          ) : null
        })}
        <span className="ml-auto flex items-center gap-1">
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => setFontSize(s)}
              className="rounded px-2 py-1"
              style={fontSize === s
                ? { background: 'var(--accent)', color: 'var(--paper)' }
                : { background: 'var(--accent-soft)', color: 'var(--ink-soft)' }}
            >
              A<span style={{ fontSize: Math.max(9, s - 8) }}>a</span>
            </button>
          ))}
        </span>
      </div>

      <div className="mt-7 rounded-xl px-6 py-7" style={{ background: 'var(--surface)', border: '1px solid var(--edge)' }}>
        <TextBody
          text={text}
          current={audio.current}
          playing={audio.playing}
          fontSize={fontSize}
        />
      </div>

      {showTranslation && (
        <div className="mt-4 rounded-xl px-6 py-5 text-sm leading-relaxed" style={{ background: 'var(--accent-soft)', color: 'var(--ink-soft)' }}>
          {text.translationEn.split('\n\n').map((p, i) => <p key={i} className={i ? 'mt-3' : ''}>{p}</p>)}
        </div>
      )}

      <p className="mt-5 text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
        Hover a word to see what it means — looking it up marks it known and it loses its
        highlight. Hovering any word of a phrase covers the whole phrase. Click a word to
        un-mark it.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => (isRead ? progress.unmarkRead(id) : markRead())}
          className="rounded px-3 py-1.5 text-xs"
          style={isRead
            ? { background: 'var(--accent)', color: 'var(--paper)' }
            : { background: 'transparent', border: '1px solid var(--edge)', color: 'var(--ink-soft)' }}
        >
          {isRead ? '✓ Read' : 'Mark as read'}
        </button>
        {isRead && (
          <span className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            {Math.round((readState[id]?.coverage ?? 0) * 100)}% of its words were known
          </span>
        )}
      </div>

      <nav className="mt-8 flex justify-between text-sm">
        {prev ? <Link to={`/read/${prev.id}`} style={{ color: 'var(--accent)' }}>← {prev.title}</Link> : <span />}
        {next ? <Link to={`/read/${next.id}`} style={{ color: 'var(--accent)' }}>{next.title} →</Link> : <span />}
      </nav>

      {text.audio && (
        <Player
          src={assetUrl(text.audio.file)}
          bind={audio.bind}
          playing={audio.playing}
          toggle={audio.toggle}
          speed={audio.speed}
          setSpeed={audio.setSpeed}
          progress={audio.progress}
        />
      )}
    </article>
  )
}
