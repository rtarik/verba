/**
 * The engine run backwards: from a word on the page to every reading of it.
 * "hablamos" → hablar, presente, nosotros — and hablar, pretérito, nosotros.
 *
 * Works on single words, as the texts are tokenised: in "había dicho" the two
 * halves are analysed separately (haber, imperfecto; decir, participio).
 * Pronouns attached to infinitives, gerunds and commands are recognised:
 * "dímelo", "contándome", "sentaos".
 */
import { attach } from './spelling.ts'
import { PERSONS, TENSE_IDS, TENSES, type Conjugator, type Person, type TenseId } from './conjugate.ts'

export type Analysis =
  | { lemma: string; kind: 'finite'; tense: TenseId; person: Person }
  | { lemma: string; kind: 'infinitivo' | 'gerundio' | 'participio' }

/** Tenses whose forms are one word. Compound tenses are haber + participle. */
const SIMPLE: TenseId[] = ['presente', 'preterito', 'imperfecto', 'futuro', 'condicional', 'subj-presente', 'subj-imperfecto', 'subj-futuro', 'imperativo']

const CLITICS = ['me', 'te', 'se', 'nos', 'os', 'lo', 'la', 'los', 'las', 'le', 'les']
const CLITIC_PAIRS = ['me', 'te', 'se', 'nos', 'os'].flatMap((a) => ['lo', 'la', 'los', 'las'].map((b) => a + b))

/** Every form with pronouns attached: dar → darme, dármelo, darse… */
function withClitics(form: string, person?: Person): string[] {
  const out: string[] = []
  for (const cl of [...CLITICS, ...CLITIC_PAIRS]) {
    // Commands drop a letter before nos / os: sentemos → sentémonos, sentad → sentaos.
    const drop = (person === 3 && cl.startsWith('nos')) || (person === 4 && cl.startsWith('os')) ? 1 : 0
    out.push(attach(form, cl, drop))
  }
  return out
}

export function createAnalyzer(c: Conjugator, lemmas: Iterable<string>) {
  const index = new Map<string, Analysis[]>()
  const add = (form: string, a: Analysis) => {
    const list = index.get(form)
    if (!list) index.set(form, [a])
    else if (!list.some((x) => JSON.stringify(x) === JSON.stringify(a))) list.push(a)
  }

  for (const lemma of lemmas) {
    for (const tense of SIMPLE) {
      for (const person of PERSONS) {
        for (const form of c.conjugate(lemma, tense, person)) {
          add(form, { lemma, kind: 'finite', tense, person })
          if (tense === 'imperativo') for (const f of withClitics(form, person)) add(f, { lemma, kind: 'finite', tense, person })
        }
      }
    }
    add(lemma, { lemma, kind: 'infinitivo' })
    for (const f of withClitics(lemma)) add(f, { lemma, kind: 'infinitivo' })
    const ger = c.gerund(lemma)
    add(ger, { lemma, kind: 'gerundio' })
    for (const f of withClitics(ger)) add(f, { lemma, kind: 'gerundio' })
    // Participles agree when used as adjectives or in the passive: hecha, escritos.
    const part = c.participle(lemma)
    for (const f of [part, ...['a', 'os', 'as'].map((e) => part.replace(/o$/, e))]) add(f, { lemma, kind: 'participio' })
  }

  return {
    /** Every reading of a word, in lower case. */
    analyze: (word: string): Analysis[] => index.get(word.toLowerCase()) ?? [],
    /** Readings of a word as a form of this particular verb. */
    readingsAs: (word: string, lemma: string): Analysis[] => (index.get(word.toLowerCase()) ?? []).filter((a) => a.lemma === lemma),
  }
}

/* ---- readings for the reader ------------------------------------------ */

export type Form = TenseId | 'infinitivo' | 'gerundio' | 'participio'

/** One reading of a word on the page, persons merged: hable → subj-presente, yo or él. */
export interface Morph {
  tense: Form
  persons?: Person[]
  /** Set on both words of a compound tense: "había dicho". */
  compound?: string
}

/** The compound tense each auxiliary tense makes: había + dicho → pluscuamperfecto. */
export const COMPOUND_OF: Partial<Record<TenseId, TenseId>> = {
  presente: 'perfecto',
  imperfecto: 'pluscuamperfecto',
  futuro: 'futuro-perfecto',
  condicional: 'condicional-compuesto',
  preterito: 'preterito-anterior',
  'subj-presente': 'subj-perfecto',
  'subj-imperfecto': 'subj-pluscuamperfecto',
}

/** Group analyses by tense, in tense order, merging persons. */
export function toMorph(readings: Analysis[]): Morph[] {
  const byTense = new Map<Form, Set<Person>>()
  for (const r of readings) {
    const key: Form = r.kind === 'finite' ? r.tense : r.kind
    const persons = byTense.get(key) ?? new Set<Person>()
    if (r.kind === 'finite') persons.add(r.person)
    byTense.set(key, persons)
  }
  const order = (f: Form) => (TENSE_IDS as readonly string[]).indexOf(f) + (f in TENSES ? 0 : 100)
  return [...byTense]
    .sort(([a], [b]) => order(a) - order(b))
    .map(([tense, ps]) => (ps.size ? { tense, persons: [...ps].sort() } : { tense }))
}

/**
 * Readings for each word of a text, given its words in order and whether only
 * spaces separate each word from the next. A form of haber directly followed
 * by a participle is read, with it, as one compound tense.
 */
export function annotate(
  analyzer: ReturnType<typeof createAnalyzer>,
  words: Array<{ s: string; lemma: string; isVerb: boolean; joinedToNext: boolean }>,
): Array<Morph[] | undefined> {
  const out: Array<Morph[] | undefined> = words.map(() => undefined)
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (!w.isVerb || out[i]) continue
    const readings = analyzer.readingsAs(w.s, w.lemma)
    const next = words[i + 1]
    if (w.lemma === 'haber' && w.joinedToNext && next?.isVerb) {
      const isParticiple = analyzer.readingsAs(next.s, next.lemma).some((r) => r.kind === 'participio')
      const compound = toMorph(readings)
        .filter((m) => m.tense in COMPOUND_OF)
        .map((m) => ({ tense: COMPOUND_OF[m.tense as TenseId]!, persons: m.persons, compound: `${w.s} ${next.s}` }))
      if (isParticiple && compound.length) {
        out[i] = compound
        out[i + 1] = compound
        continue
      }
    }
    out[i] = toMorph(readings)
  }
  return out
}
