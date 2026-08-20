/**
 * Compiles authoring sources (prose + glosses) into the token format the app
 * consumes, and reports every problem it finds along the way.
 *
 * Both `content:build` and `content:check` call compileAll(). The validator is
 * simply the build without the writes, so a passing check guarantees a
 * buildable corpus. Imports nothing from src/ — this runs with no app present.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  zSourceText, zLexicon, zCurriculum, zAudioSidecar, zText,
  type SourceText, type Text, type Token, type WordToken,
  type Phrase, type LexiconEntry, type Curriculum, type AudioSidecar,
} from '../../content/schema.ts'
import { tokenize, wordSurfaces, hashBody } from './tokenize.ts'

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const CONTENT = join(ROOT, 'content')

export interface Diagnostics { errors: string[]; warnings: string[] }

/** Lemmas that are proper nouns aren't vocabulary — they'd inflate stats. */
const isName = (pos?: string) => pos === 'name'

function walkJson(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry: string) => {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) return walkJson(p)
    return p.endsWith('.json') ? [p] : []
  })
}

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

export type CompiledText = Text & { body: string; bodyHash: string }

export interface CompiledCorpus {
  texts: CompiledText[]
  /** Every lemma encountered, derived from the texts and curated overrides. */
  lexicon: Record<string, LexiconEntry & { firstSeenIn: string }>
  curriculum: Curriculum
  diagnostics: Diagnostics
}

export function compileAll(): CompiledCorpus {
  const errors: string[] = []
  const warnings: string[] = []

  const curriculum = zCurriculum.parse(readJson(join(CONTENT, 'curriculum.json')))
  const curated = zLexicon.parse(readJson(join(CONTENT, 'lexicon.json')))

  // ---- load sources -------------------------------------------------------
  const sources = new Map<string, SourceText>()
  for (const file of walkJson(join(CONTENT, 'texts'))) {
    const parsed = zSourceText.safeParse(readJson(file))
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${file}: ${issue.path.join('.')} — ${issue.message}`)
      }
      continue
    }
    const rel = file.slice(ROOT.length + 1)
    if (sources.has(parsed.data.id)) errors.push(`${rel}: duplicate text id "${parsed.data.id}"`)
    sources.set(parsed.data.id, parsed.data)
  }

  // ---- curriculum <-> files must agree ------------------------------------
  const ordered = curriculum.units.flatMap((u) => u.textIds)
  for (const id of ordered) {
    if (!sources.has(id)) errors.push(`curriculum.json lists "${id}" but no text file defines it`)
  }
  for (const id of sources.keys()) {
    if (!ordered.includes(id)) warnings.push(`text "${id}" exists but no unit in curriculum.json lists it — it will not appear in the library`)
  }

  // ---- compile in curriculum order, tracking vocabulary as we go ----------
  const texts: CompiledText[] = []
  const lexicon: CompiledCorpus['lexicon'] = {}
  const introduced = new Set<string>()

  for (const id of ordered) {
    const src = sources.get(id)
    if (!src) continue
    const { text, errors: e, warnings: w } = compileText(src, curated)
    errors.push(...e)
    warnings.push(...w)
    if (!text) continue

    // --- the progressive-vocabulary gate ---------------------------------
    const declared = new Set(src.newLemmas)
    const unexplained = new Set<string>()
    for (const word of text.tokens.filter((t): t is WordToken => t.k === 'w')) {
      if (isName(word.pos)) continue
      const lemma = word.lemma
      if (!introduced.has(lemma) && !declared.has(lemma)) unexplained.add(lemma)
      if (!lexicon[lemma]) {
        lexicon[lemma] = {
          lemma,
          gloss: curated[lemma]?.gloss ?? word.gloss,
          pos: curated[lemma]?.pos ?? word.pos ?? 'unknown',
          level: curated[lemma]?.level ?? src.level,
          ...(curated[lemma]?.note ? { note: curated[lemma].note } : {}),
          firstSeenIn: id,
        }
      }
    }
    if (unexplained.size) {
      errors.push(
        `${id}: uses ${unexplained.size} lemma(s) never introduced earlier and not listed in newLemmas: ` +
          [...unexplained].sort().join(', ')
      )
    }
    for (const lemma of declared) {
      if (introduced.has(lemma)) {
        warnings.push(`${id}: declares "${lemma}" as new, but it was already introduced in an earlier text`)
      }
    }
    declared.forEach((l) => introduced.add(l))

    const isFirst = id === ordered[0]
    if (!isFirst && src.newLemmas.length > 12) {
      warnings.push(`${id}: introduces ${src.newLemmas.length} new lemmas (target is 8–12) — consider splitting`)
    }

    // --- grammar cross-references ----------------------------------------
    for (const ref of src.grammarRefs) {
      if (!grammarIds().has(ref)) errors.push(`${id}: grammarRefs "${ref}" has no matching doc in content/grammar/`)
    }

    texts.push({ ...text, body: src.body, bodyHash: hashBody(src.body) })
  }

  return { texts, lexicon, curriculum, diagnostics: { errors, warnings } }
}

let _grammarIds: Set<string> | null = null
function grammarIds(): Set<string> {
  if (_grammarIds) return _grammarIds
  const dir = join(CONTENT, 'grammar')
  const ids = new Set<string>()
  const walk = (d: string) => {
    if (!existsSync(d)) return
    for (const entry of readdirSync(d)) {
      const p = join(d, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (entry.endsWith('.md')) {
        const m = readFileSync(p, 'utf8').match(/^---\s*[\s\S]*?\bid:\s*([a-z0-9-]+)/)
        if (m) ids.add(m[1])
      }
    }
  }
  walk(dir)
  _grammarIds = ids
  return ids
}

export function compileText(
  src: SourceText,
  curated: Record<string, LexiconEntry>
): { text: Text | null; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  // ---- tokenize and attach glosses ----------------------------------------
  const raw = tokenize(src.body)
  const tokens: Token[] = []
  const missing = new Set<string>()
  let wi = 0

  for (const t of raw) {
    if (t.k === 'br') { tokens.push({ k: 'br' }); continue }
    if (t.k === 'p') { tokens.push({ k: 'p', s: t.s }); continue }

    // Text-level override first (context-specific meaning), then the shared
    // dictionary. Exact case before lowercase, so "Se" finds "se" but a
    // deliberately capitalised entry still wins.
    const entry =
      src.glosses[t.s] ??
      src.glosses[t.s.toLowerCase()] ??
      curated[t.s] ??
      curated[t.s.toLowerCase()]
    if (!entry) {
      missing.add(t.s)
      // Keep compiling so one run reports every missing gloss, not just the first.
      tokens.push({ k: 'w', i: wi++, s: t.s, lemma: t.s.toLowerCase(), gloss: '???' })
      continue
    }
    tokens.push({
      k: 'w', i: wi++, s: t.s,
      lemma: entry.lemma,
      gloss: entry.gloss,
      ...(entry.pos ? { pos: entry.pos } : {}),
      ...('note' in entry && entry.note ? { note: entry.note } : {}),
    })
  }

  if (missing.size) {
    errors.push(
      `${src.id}: ${missing.size} word(s) have no gloss: ${[...missing].sort().join(', ')}\n` +
        `      -> add to content/lexicon.json (shared) or this text's "glosses" (context-specific)`
    )
  }

  // ---- resolve phrases from surface text to word-index ranges -------------
  const surfaces = wordSurfaces(src.body).map((s) => s.toLowerCase())
  const phrases: Phrase[] = []

  for (const p of src.phrases) {
    const needle = wordSurfaces(p.s).map((s) => s.toLowerCase())
    if (!needle.length) { errors.push(`${src.id}: phrase "${p.s}" contains no words`); continue }

    const hits: number[] = []
    for (let i = 0; i + needle.length <= surfaces.length; i++) {
      if (needle.every((w, k) => surfaces[i + k] === w)) hits.push(i)
    }

    if (!hits.length) { errors.push(`${src.id}: phrase "${p.s}" does not appear in the body`); continue }
    if (hits.length > 1 && p.at === undefined) {
      errors.push(`${src.id}: phrase "${p.s}" appears ${hits.length} times — add "at" with one of: ${hits.join(', ')}`)
      continue
    }
    const from = p.at ?? hits[0]
    if (!hits.includes(from)) {
      errors.push(`${src.id}: phrase "${p.s}" has at=${from}, but it occurs at: ${hits.join(', ')}`)
      continue
    }
    phrases.push({ from, to: from + needle.length - 1, s: p.s, gloss: p.gloss, ...(p.note ? { note: p.note } : {}) })
  }

  // ---- attach audio if a sidecar exists and still matches the prose -------
  const audio = loadAudio(src, wi, errors, warnings)

  const candidate = {
    id: src.id, level: src.level, unit: src.unit, order: src.order,
    title: src.title, titleEn: src.titleEn, blurbEn: src.blurbEn,
    grammarRefs: src.grammarRefs, newLemmas: src.newLemmas,
    tokens, phrases, translationEn: src.translationEn, audio,
  }

  const parsed = zText.safeParse(candidate)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${src.id}: ${issue.path.join('.')} — ${issue.message}`)
    return { text: null, errors, warnings }
  }
  return { text: parsed.data, errors, warnings }
}

function loadAudio(src: SourceText, wordCount: number, errors: string[], warnings: string[]) {
  const file = join(CONTENT, 'audio', `${src.id}.json`)
  if (!existsSync(file)) {
    warnings.push(`${src.id}: no audio yet — run: npm run content:audio`)
    return null
  }
  const parsed = zAudioSidecar.safeParse(readJson(file))
  if (!parsed.success) {
    errors.push(`${src.id}: malformed audio sidecar`)
    return null
  }
  const side: AudioSidecar = parsed.data

  if (side.bodyHash !== hashBody(src.body)) {
    warnings.push(`${src.id}: text changed since audio was generated — timings are stale, re-run: npm run content:audio`)
    return null
  }
  if (side.starts.length !== wordCount) {
    errors.push(`${src.id}: audio has ${side.starts.length} timings for ${wordCount} words`)
    return null
  }
  return { file: `audio/${src.id}.mp3`, voice: side.voice, rate: side.rate, duration: side.duration, starts: side.starts }
}
