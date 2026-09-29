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
import { PERSONS, type Conjugator, type Person, type TenseId } from './conjugate.ts'

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
