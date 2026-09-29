/**
 * The app's only content adapter.
 *
 * Every component reads content through this module, never by importing JSON
 * directly. If the content format changes, this file changes and nothing else
 * does. Texts are discovered by glob, so adding one needs no code edit here.
 */
import type { Text, Unit, LexiconEntry } from '@content/schema'
import { GRAMMAR_CATEGORIES } from '@content/schema'
import indexJson from '@content/build/index.json'
import lexiconJson from '@content/build/lexicon.json'

export type { Text, Unit } from '@content/schema'

export interface LibraryEntry {
  id: string
  level: 'A1' | 'A2' | 'B1' | 'B2'
  unit: number
  order: number
  title: string
  titleEn: string
  blurbEn: string
  grammarRefs: string[]
  wordCount: number
  hasAudio: boolean
  /** Distinct trackable lemmas, used for the known-coverage figure. */
  lemmas: string[]
}

export type CatalogLexicon = Record<string, LexiconEntry & { firstSeenIn: string }>

export const units = indexJson.units as Unit[]
export const library = indexJson.texts as LibraryEntry[]
export const lexicon = lexiconJson as CatalogLexicon

const textModules = import.meta.glob<{ default: Text }>('/content/build/texts/*.json')

const cache = new Map<string, Text>()

export async function loadText(id: string): Promise<Text> {
  const hit = cache.get(id)
  if (hit) return hit
  const loader = textModules[`/content/build/texts/${id}.json`]
  if (!loader) throw new Error(`No text "${id}"`)
  const mod = await loader()
  cache.set(id, mod.default)
  return mod.default
}

/** Resolve an asset path against the deploy base (/verba/ on GitHub Pages). */
export const assetUrl = (p: string) => `${import.meta.env.BASE_URL}${p.replace(/^\//, '')}`

/** Reading order across the whole curriculum. */
export const readingOrder: LibraryEntry[] = units
  .flatMap((u) => u.textIds)
  .map((id) => library.find((t) => t.id === id))
  .filter((t): t is LibraryEntry => Boolean(t))

export const neighbours = (id: string) => {
  const i = readingOrder.findIndex((t) => t.id === id)
  return { prev: i > 0 ? readingOrder[i - 1] : null, next: i >= 0 && i < readingOrder.length - 1 ? readingOrder[i + 1] : null }
}

/* ---- grammar ---------------------------------------------------------- */

export interface GrammarDoc {
  id: string
  title: string
  level: string
  category: string
  order: number
  related: string[]
  body: string
}

const grammarModules = import.meta.glob<string>('/content/grammar/**/*.md', { query: '?raw', import: 'default', eager: true })

export const grammarDocs: GrammarDoc[] = Object.values(grammarModules)
  .map((raw) => {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
    if (!m) return null
    const meta = Object.fromEntries(
      m[1].split(/\r?\n/).map((line) => {
        const idx = line.indexOf(':')
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')]
      })
    )
    return {
      id: meta.id,
      title: meta.title,
      level: meta.level,
      category: meta.category,
      order: Number(meta.order ?? 50),
      related: (meta.related ?? '').replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean),
      body: m[2],
    }
  })
  .filter((d): d is GrammarDoc => Boolean(d?.id))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

/** Grammar grouped into its display sections, empty categories dropped. */
export const grammarByCategory: Array<{ category: string; docs: GrammarDoc[] }> =
  GRAMMAR_CATEGORIES.map((category) => ({
    category,
    docs: grammarDocs.filter((d) => d.category === category),
  })).filter((g) => g.docs.length > 0)

export const grammarById = (id: string) => grammarDocs.find((d) => d.id === id)

/** Texts that reference a grammar topic, for back-links from the reference. */
export const textsUsingGrammar = (gid: string) => library.filter((t) => allGrammarRefs[t.id]?.includes(gid))

const allGrammarRefs: Record<string, string[]> = Object.fromEntries(
  (indexJson.texts as Array<{ id: string; grammarRefs?: string[] }>).map((t) => [t.id, t.grammarRefs ?? []])
)
