/**
 * Marking answers, and saying what went wrong.
 *
 * Accents are forgiven with a warning — except where the accent is the whole
 * difference between two forms of the verb (hablo / habló, hable / hablé).
 * There a warning would teach the wrong lesson, so the answer is wrong.
 *
 * A wrong answer gets the most specific diagnosis that fits: another person
 * or tense of the same verb, a missing pronoun, a spelling rule, a missed
 * stem change, or the regular pattern applied to an irregular verb.
 */
import { stripAccents } from './spelling.ts'
import {
  COMMAND_LABELS, DRILL_TENSES, PERSONS, PERSON_LABELS, TENSES, createConjugator, isCommand,
  type Conjugator, type Person, type StemChange, type TenseId, type VerbSpecs,
} from './conjugate.ts'

export interface Prompt {
  inf: string
  tense: TenseId
  person: Person
  refl?: boolean
}

/** One cell of a verb's paradigm. */
export interface Reading {
  tense: TenseId
  person: Person
}

export type Diagnosis =
  /** The typed form, accents and all, is a different cell: hablo for habló. */
  | { kind: 'accent-meaning'; as: Reading }
  | { kind: 'person'; as: Reading }
  | { kind: 'tense'; as: Reading }
  | { kind: 'pronoun' }
  | { kind: 'spelling' }
  | { kind: 'stem'; change: StemChange }
  | { kind: 'regularized' }
  | { kind: 'unknown' }

export type Regularity = 'regular' | 'spelling' | 'stem' | 'irregular'

export type Verdict =
  | { result: 'correct'; expected: string }
  /** Right letters, wrong accents, and nothing else it could be mistaken for. */
  | { result: 'accent'; expected: string }
  | { result: 'wrong'; expected: string; diagnosis: Diagnosis }

const SUBJECTS = new Set([
  'yo', 'tú', 'tu', 'él', 'el', 'ella', 'usted', 'ud', 'vd',
  'nosotros', 'nosotras', 'vosotros', 'vosotras', 'ellos', 'ellas', 'ustedes', 'uds', 'vds',
])

/** Lower-case, drop punctuation and extra spaces, and allow a leading subject pronoun. */
export function normalize(answer: string): string {
  const words = answer.toLowerCase().replace(/[¡!¿?.,;:"«»]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length > 1 && SUBJECTS.has(words[0])) words.shift()
  return words.join(' ')
}

export const personLabel = (tense: TenseId, p: Person) => (isCommand(tense) ? COMMAND_LABELS[p] : PERSON_LABELS[p]) ?? ''

export function createChecker(specs: VerbSpecs) {
  const conj = createConjugator(specs)
  const unspelled = createConjugator(specs, { spelling: false })

  /** Every drillable cell of a verb, indexed by exact form and by form without accents. */
  const indexes = new Map<string, { exact: Map<string, Reading[]>; bare: Map<string, Reading[]> }>()
  function indexOf(inf: string, refl: boolean) {
    const key = `${inf}|${refl}`
    const hit = indexes.get(key)
    if (hit) return hit
    const exact = new Map<string, Reading[]>()
    const bare = new Map<string, Reading[]>()
    const push = (m: Map<string, Reading[]>, k: string, r: Reading) => {
      const list = m.get(k)
      if (list) list.push(r)
      else m.set(k, [r])
    }
    for (const tense of DRILL_TENSES) {
      for (const person of PERSONS) {
        for (const f of conj.conjugate(inf, tense, person, { refl })) {
          push(exact, f, { tense, person })
          push(bare, stripAccents(f), { tense, person })
        }
      }
    }
    const idx = { exact, bare }
    indexes.set(key, idx)
    return idx
  }

  /** The spec at the end of a base chain: mantener → tener. */
  const rootOf = (inf: string): string => {
    const base = specs[inf]?.base
    return base ? rootOf(base) : inf
  }

  /** The verb conjugated as if its stem never changed. */
  const unchanged = new Map<string, Conjugator>()
  function withoutStemChange(inf: string): Conjugator {
    const root = rootOf(inf)
    let c = unchanged.get(root)
    if (!c) {
      c = createConjugator({ ...specs, [root]: { ...specs[root], stem: undefined } })
      unchanged.set(root, c)
    }
    return c
  }

  // The verb conjugated as if it were entirely regular. haber is kept, so
  // compound tenses stay right while the participle regularises.
  const onlyHaber: VerbSpecs = { haber: specs.haber }
  const regular = createConjugator(onlyHaber, { auto: false })
  const regularUnspelled = createConjugator(onlyHaber, { auto: false, spelling: false })

  /** The verb conjugated with its stem change and nothing else irregular. */
  const stemOnly = new Map<string, Conjugator>()
  function withOnlyStemChange(inf: string): Conjugator {
    let c = stemOnly.get(inf)
    if (!c) {
      const root = specs[rootOf(inf)] ?? {}
      c = createConjugator({ ...onlyHaber, [inf]: { stem: root.stem, accent: root.accent } }, { auto: false })
      stemOnly.set(inf, c)
    }
    return c
  }

  /**
   * How a verb behaves in a tense, judged from the forms themselves: regular,
   * regular apart from spelling (busqué, construyo), regular apart from a stem
   * change (pienso, envío), or irregular.
   */
  const regularities = new Map<string, Regularity>()
  function regularity(inf: string, tense: TenseId): Regularity {
    const key = `${inf}|${tense}`
    const hit = regularities.get(key)
    if (hit) return hit
    const firsts = (c: Conjugator) => c.table(inf, tense).map((cell) => cell[0] ?? '').join(' ')
    const actual = firsts(conj)
    const r: Regularity =
      actual === firsts(regularUnspelled) ? 'regular'
        : actual === firsts(regular) ? 'spelling'
          : actual === firsts(withOnlyStemChange(inf)) ? 'stem'
            : 'irregular'
    regularities.set(key, r)
    return r
  }

  const same = (a: Reading, b: Reading) => a.tense === b.tense && a.person === b.person
  const matches = (forms: string[], bare: string) => forms.some((f) => stripAccents(f) === bare)

  function check(prompt: Prompt, answer: string): Verdict {
    const { inf, tense, person } = prompt
    const refl = prompt.refl ?? false
    const accepted = conj.conjugate(inf, tense, person, { refl })
    const expected = accepted[0] ?? ''
    const typed = normalize(answer)
    const wrong = (diagnosis: Diagnosis): Verdict => ({ result: 'wrong', expected, diagnosis })

    if (accepted.includes(typed)) return { result: 'correct', expected }
    if (!typed) return wrong({ kind: 'unknown' })

    const here: Reading = { tense, person }
    const idx = indexOf(inf, refl)
    const bare = stripAccents(typed)

    if (matches(accepted, bare)) {
      const other = idx.exact.get(typed)?.find((r) => !same(r, here))
      return other ? wrong({ kind: 'accent-meaning', as: other }) : { result: 'accent', expected }
    }

    // A real form of this verb, just not the one asked for. Exact matches first;
    // matches that ignore accents only after every other explanation, so that
    // penso reads as a missed stem change rather than as pensó.
    const elsewhere = (m: Map<string, Reading[]>, k: string): Diagnosis | null => {
      const rs = (m.get(k) ?? []).filter((r) => !same(r, here))
      const sameTense = rs.find((r) => r.tense === tense)
      if (sameTense) return { kind: 'person', as: sameTense }
      const other = rs.find((r) => r.person === person) ?? rs[0]
      return other ? { kind: 'tense', as: other } : null
    }
    const exactly = elsewhere(idx.exact, typed)
    if (exactly) return wrong(exactly)

    if (refl && matches(conj.conjugate(inf, tense, person), bare)) return wrong({ kind: 'pronoun' })
    if (matches(unspelled.conjugate(inf, tense, person, { refl }), bare)) return wrong({ kind: 'spelling' })

    const root = specs[rootOf(inf)]
    // (Accent-only stem changes, envío / envio, are already an accent warning above.)
    if (root?.stem && matches(withoutStemChange(inf).conjugate(inf, tense, person, { refl }), bare)) {
      return wrong({ kind: 'stem', change: root.stem })
    }
    const reg = regular.conjugate(inf, tense, person, { refl })
    if (!matches(accepted, stripAccents(reg[0] ?? '')) && matches(reg, bare)) return wrong({ kind: 'regularized' })

    const loosely = elsewhere(idx.bare, bare)
    if (loosely) return wrong(loosely)

    return wrong({ kind: 'unknown' })
  }

  /** Every cell of the verb that is spelled exactly like `form`. */
  const readingsOf = (inf: string, form: string, refl = false): Reading[] => indexOf(inf, refl).exact.get(form) ?? []

  /**
   * Mark an identification: which verb, tense and person is `form`?
   * Ambiguous forms accept any of their readings — hable is yo or él.
   */
  function checkIdentify(prompt: Prompt, form: string, guess: { inf: string; tense: TenseId; person: Person }) {
    const readings = readingsOf(prompt.inf, form, prompt.refl)
    // Pronominal verbs may be named with or without their -se: levantarse, levantar.
    const named = stripAccents(normalize(guess.inf))
    const inf = named === stripAccents(prompt.inf) || (Boolean(prompt.refl) && named === `${stripAccents(prompt.inf)}se`)
    const tense = readings.some((r) => r.tense === guess.tense)
    const person = readings.some((r) => r.person === guess.person && (!tense || r.tense === guess.tense))
    return { inf, tense, person, correct: inf && tense && person, readings }
  }

  return { check, checkIdentify, readingsOf, regularity, conjugator: conj }
}

export type Checker = ReturnType<typeof createChecker>

/** Reference pages the explanations link to. */
const SPELLING_REF = 'conjugacion-cambios-ortograficos'
const STEM_REF = 'conjugacion-cambios-vocalicos'

/**
 * The letters that differ between two forms: pensa / piensa → e / ie,
 * sentió / sintió → e / i. Where one side is empty, the neighbouring vowel is
 * included so the change reads as a vowel change.
 */
export function difference(typed: string, expected: string): [string, string] {
  const a = stripAccents(typed)
  const b = stripAccents(expected)
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let q = 0
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++
  let from = p
  let to = [a.length - q, b.length - q]
  if (from === to[0] || from === to[1]) {
    if (p > 0 && 'aeiou'.includes(a[p - 1])) from--
    else to = [to[0] + 1, to[1] + 1]
  }
  return [a.slice(from, to[0]), b.slice(from, to[1])]
}

/**
 * A sentence explaining a diagnosis, and the reference page to read.
 * `typed` is the learner's answer as normalised.
 */
export function explain(d: Diagnosis, prompt: Prompt, typed: string, expected: string): { text: string; ref: string } {
  const t = TENSES[prompt.tense]
  const cell = (r: Reading) => `the ${TENSES[r.tense].en} ${personLabel(r.tense, r.person)} form`
  const name = prompt.refl ? `${prompt.inf}se` : prompt.inf
  switch (d.kind) {
    case 'accent-meaning':
      return { text: `“${typed}” is ${cell(d.as)} — here the accent changes the meaning.`, ref: t.ref }
    case 'person':
      return { text: `Right tense, wrong person: that is the ${personLabel(d.as.tense, d.as.person)} form.`, ref: t.ref }
    case 'tense':
      return { text: `That is ${cell(d.as)}.`, ref: TENSES[d.as.tense].ref }
    case 'pronoun':
      return { text: `${name} needs its pronoun.`, ref: t.ref }
    case 'spelling':
      return { text: 'Right pattern, but the spelling changes to keep the sound of the stem.', ref: SPELLING_REF }
    case 'stem': {
      const [from, to] = difference(typed, expected)
      return { text: `${name} changes its stem here: ${from} → ${to}.`, ref: STEM_REF }
    }
    case 'regularized':
      return { text: `${name} is irregular in the ${t.en}.`, ref: prompt.tense === 'presente' ? 'verbos-irregulares-indice' : t.ref }
    case 'unknown':
      return { text: 'Not a form of this verb.', ref: t.ref }
  }
}
