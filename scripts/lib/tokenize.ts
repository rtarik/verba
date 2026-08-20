/**
 * Spanish tokenizer. Deterministic and shared by every consumer — the content
 * build, the validator, and the TTS timing check all must agree on exactly
 * what counts as a word, or audio drifts out of sync with the text.
 */

/** Letters plus combining marks, allowing internal apostrophes and hyphens. */
const WORD_RE = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu

export type RawToken =
  | { k: 'w'; s: string }
  | { k: 'p'; s: string }
  | { k: 'br' }

/**
 * Split prose into word / punctuation / break tokens.
 * A blank line becomes a break; all other whitespace and punctuation is
 * preserved verbatim so the text renders exactly as written.
 */
export function tokenize(body: string): RawToken[] {
  const out: RawToken[] = []
  const paragraphs = body.trim().split(/\n\s*\n/)

  paragraphs.forEach((para, pi) => {
    if (pi > 0) out.push({ k: 'br' })
    const text = para.replace(/\s+/g, ' ').trim()
    let cursor = 0
    for (const m of text.matchAll(WORD_RE)) {
      if (m.index > cursor) out.push({ k: 'p', s: text.slice(cursor, m.index) })
      out.push({ k: 'w', s: m[0] })
      cursor = m.index + m[0].length
    }
    if (cursor < text.length) out.push({ k: 'p', s: text.slice(cursor) })
  })

  return out
}

/** Just the word surface forms, in order. This is the sequence audio timings align to. */
export const wordSurfaces = (body: string): string[] =>
  tokenize(body).filter((t): t is { k: 'w'; s: string } => t.k === 'w').map((t) => t.s)

/** Stable hash of the prose, used to detect audio that no longer matches its text. */
export function hashBody(body: string): string {
  const norm = wordSurfaces(body).join(' ').toLowerCase()
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'))
}
