/**
 * The conjugation engine: any form of any verb, from rules plus a short list
 * of what each irregular verb does differently (content/verbs.json).
 *
 * The rules follow the conjugation reference pages, and so do the shortcuts:
 * the imperfect subjunctive is built from the ellos preterite, the
 * conditional from the future stem, the present subjunctive from the yo
 * present, and the commands from the present subjunctive. A verb that is
 * irregular in a source form is therefore irregular in everything built from
 * it, with no second entry.
 *
 * Pure TypeScript with no app or Node imports: scripts/ and src/ both use it.
 */
import { attach, fixMonosyllable, prefix, stripAccents } from './spelling.ts'

/* ---- tenses and persons ------------------------------------------------- */

export const TENSE_IDS = [
  'presente',
  'preterito',
  'imperfecto',
  'futuro',
  'condicional',
  'perfecto',
  'pluscuamperfecto',
  'futuro-perfecto',
  'condicional-compuesto',
  'subj-presente',
  'subj-imperfecto',
  'subj-perfecto',
  'subj-pluscuamperfecto',
  'imperativo',
  'imperativo-negativo',
  'subj-futuro',
] as const
export type TenseId = (typeof TENSE_IDS)[number]

export interface TenseInfo {
  /** Spanish name, as the grammar pages use it. */
  name: string
  en: string
  level: 'A1' | 'A2' | 'B1' | 'B2'
  /** Conjugation reference page that tabulates it. */
  ref: string
  /** Recognised when reading but never drilled: the literary future subjunctive. */
  readOnly?: boolean
}

export const TENSES: Record<TenseId, TenseInfo> = {
  presente: { name: 'presente', en: 'present', level: 'A1', ref: 'conjugacion-presente' },
  preterito: { name: 'pretérito indefinido', en: 'preterite', level: 'A2', ref: 'conjugacion-preterito' },
  imperfecto: { name: 'pretérito imperfecto', en: 'imperfect', level: 'A2', ref: 'conjugacion-imperfecto' },
  futuro: { name: 'futuro', en: 'future', level: 'A2', ref: 'conjugacion-futuro-condicional' },
  condicional: { name: 'condicional', en: 'conditional', level: 'A2', ref: 'conjugacion-futuro-condicional' },
  perfecto: { name: 'pretérito perfecto', en: 'present perfect', level: 'A2', ref: 'conjugacion-compuestos' },
  pluscuamperfecto: { name: 'pluscuamperfecto', en: 'pluperfect', level: 'B1', ref: 'conjugacion-compuestos' },
  'futuro-perfecto': { name: 'futuro perfecto', en: 'future perfect', level: 'B1', ref: 'conjugacion-compuestos' },
  'condicional-compuesto': { name: 'condicional compuesto', en: 'conditional perfect', level: 'B1', ref: 'conjugacion-compuestos' },
  'subj-presente': { name: 'presente de subjuntivo', en: 'present subjunctive', level: 'B1', ref: 'conjugacion-subjuntivo' },
  'subj-imperfecto': { name: 'imperfecto de subjuntivo', en: 'imperfect subjunctive', level: 'B2', ref: 'conjugacion-subjuntivo' },
  'subj-perfecto': { name: 'perfecto de subjuntivo', en: 'present perfect subjunctive', level: 'B1', ref: 'conjugacion-compuestos' },
  'subj-pluscuamperfecto': { name: 'pluscuamperfecto de subjuntivo', en: 'pluperfect subjunctive', level: 'B2', ref: 'conjugacion-compuestos' },
  imperativo: { name: 'imperativo', en: 'command', level: 'A2', ref: 'conjugacion-imperativo' },
  'imperativo-negativo': { name: 'imperativo negativo', en: 'negative command', level: 'B1', ref: 'conjugacion-imperativo' },
  'subj-futuro': { name: 'futuro de subjuntivo', en: 'future subjunctive', level: 'B2', ref: 'tiempos-literarios', readOnly: true },
}

/** Tenses offered in drills. */
export const DRILL_TENSES = TENSE_IDS.filter((t) => !TENSES[t].readOnly)

/** 0 yo · 1 tú · 2 él/usted · 3 nosotros · 4 vosotros · 5 ellos/ustedes */
export type Person = 0 | 1 | 2 | 3 | 4 | 5
export const PERSONS: readonly Person[] = [0, 1, 2, 3, 4, 5]
export const PERSON_LABELS = ['yo', 'tú', 'él / ella / usted', 'nosotros', 'vosotros', 'ellos / ellas / ustedes'] as const
/** Commands have no yo; the third-person slots are usted and ustedes. */
export const COMMAND_LABELS = [null, 'tú', 'usted', 'nosotros', 'vosotros', 'ustedes'] as const

export const isCommand = (t: TenseId) => t === 'imperativo' || t === 'imperativo-negativo'

/* ---- verb data ---------------------------------------------------------- */

export type StemChange = 'e>ie' | 'o>ue' | 'u>ue' | 'e>i'
type SimpleTense = 'presente' | 'preterito' | 'imperfecto' | 'subj-presente' | 'imperativo'

/** A cell: one form, several accepted forms (first is the one to teach), or null to compute. */
export type Cell = string | string[] | null

/**
 * What a verb does differently from the regular pattern. A regular verb needs
 * no entry at all; spelling changes (busqué, cojo, sigo, construyo, leyó) and
 * the -zco of conocer-type verbs follow from the infinitive and need none either.
 */
export interface VerbSpec {
  /** Conjugates as this verb with the difference prefixed: mantener → tener. */
  base?: string
  /** The boot-shaped stem change of the present. -ir verbs also narrow e→i, o→u elsewhere. */
  stem?: StemChange
  /** Stressed i/u in the present boot: enviar → envío, continuar → continúo. */
  accent?: boolean
  /** Irregular yo present. The present subjunctive is built from it: tengo → tenga. */
  yo?: string
  /** Present subjunctive stem when it cannot come from the yo form: saber → sep-. */
  subj?: string
  /** Strong preterite stem, which takes unstressed endings: tener → tuv- (tuve, tuvo). */
  pret?: string
  /** Future and conditional stem: tener → tendr-. */
  fut?: string
  /** Imperfect stem, for ver → ve- (veía). */
  impf?: string
  part?: string
  ger?: string
  /** Irregular affirmative tú command: ten, pon, haz. */
  impTu?: string
  /** Whole-tense or single-cell overrides for the true outliers (ser, ir, estar…). */
  forms?: Partial<Record<SimpleTense, Cell[]>>
  /** Drilled as a pronominal verb: levantarse, quejarse. */
  refl?: boolean
  /**
   * Persons the verb is really used in: 'third' for gustar-type verbs
   * (él and ellos only), 'impersonal' for weather verbs (él only).
   */
  only?: 'third' | 'impersonal'
  /** No commands: haber, poder, soler. */
  noCommand?: boolean
  /** English gloss, when the lexicon has no entry for the infinitive itself. */
  gloss?: string
}
export type VerbSpecs = Record<string, VerbSpec>

/* ---- endings ------------------------------------------------------------ */

type Conj = 'ar' | 'er' | 'ir'
type Six = readonly [string, string, string, string, string, string]

const PRESENT: Record<Conj, Six> = {
  ar: ['o', 'as', 'a', 'amos', 'áis', 'an'],
  er: ['o', 'es', 'e', 'emos', 'éis', 'en'],
  ir: ['o', 'es', 'e', 'imos', 'ís', 'en'],
}
const PRETERITE: Record<Conj, Six> = {
  ar: ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'],
  er: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
  ir: ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
}
const STRONG: Six = ['e', 'iste', 'o', 'imos', 'isteis', 'ieron']
const IMPERFECT: Record<Conj, Six> = {
  ar: ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
  er: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
  ir: ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
}
const SUBJUNCTIVE: Record<Conj, Six> = {
  ar: ['e', 'es', 'e', 'emos', 'éis', 'en'],
  er: ['a', 'as', 'a', 'amos', 'áis', 'an'],
  ir: ['a', 'as', 'a', 'amos', 'áis', 'an'],
}
const FUTURE: Six = ['é', 'ás', 'á', 'emos', 'éis', 'án']
const CONDITIONAL: Six = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían']

/** The persons whose present stem is stressed: the "boot". */
const BOOT = new Set<number>([0, 1, 2, 5])
const PRONOUNS = ['me', 'te', 'se', 'nos', 'os', 'se'] as const

/* ---- stems and joins ---------------------------------------------------- */

/**
 * Glue a stem to an ending, applying the spelling rules that keep the sound
 * of the stem: busc+é → busqué, cog+o → cojo, sigu+o → sigo, le+ió → leyó.
 */
function spell(stem: string, ending: string, conj: Conj): string {
  const front = /^[eéií]/.test(ending)
  const back = /^[aoáó]/.test(ending)
  if (conj === 'ar' && front) {
    if (stem.endsWith('c')) stem = stem.slice(0, -1) + 'qu'
    else if (stem.endsWith('gu')) stem = stem.slice(0, -1) + 'ü'
    else if (stem.endsWith('g')) stem = stem + 'u'
    else if (stem.endsWith('z')) stem = stem.slice(0, -1) + 'c'
  }
  if (conj !== 'ar') {
    const last = stem[stem.length - 1]
    const guQu = /[gq]u$/.test(stem)
    if (back) {
      if (stem.endsWith('gu')) stem = stem.slice(0, -1)
      else if (stem.endsWith('g')) stem = stem.slice(0, -1) + 'j'
      else if (/[^aeiou]c$/.test(stem)) stem = stem.slice(0, -1) + 'z'
    }
    if (last !== undefined && 'aeou'.includes(last) && !guQu) {
      // An unstressed i between vowels becomes y: leyó, construyendo, cayeron.
      if (/^i[eó]/.test(ending)) ending = 'y' + ending.slice(1)
      // After a, e, o a stressed i needs its accent to stay a separate syllable: leíste, oído.
      else if (last !== 'u' && ending[0] === 'i') ending = 'í' + ending.slice(1)
      // -uir verbs insert y before a, e, o: construyo, construye.
      else if (last === 'u' && conj === 'ir' && /^[aeoáéó]/.test(ending)) ending = 'y' + ending
    }
  }
  return stem + ending
}

function changeStem(stem: string, change: StemChange, narrow: boolean): string {
  const [from, to] = change.split('>')
  const at = stem.lastIndexOf(from)
  if (at < 0) throw new Error(`stem change ${change} does not fit "${stem}"`)
  const into = narrow ? ({ e: 'i', o: 'u', u: 'u' } as Record<string, string>)[from] : to
  let s = stem.slice(0, at) + into + stem.slice(at + 1)
  // A word cannot start with ue or ie: oler → huelo, errar → yerro.
  if (!narrow) s = s.replace(/^ue/, 'hue').replace(/^ie/, 'ye')
  return s
}

/** Put the accent on the stem's last i or u: envi → enví, continu → continú. */
const accentStem = (stem: string) => {
  const at = Math.max(stem.lastIndexOf('i'), stem.lastIndexOf('u'))
  return at < 0 ? stem : stem.slice(0, at) + (stem[at] === 'i' ? 'í' : 'ú') + stem.slice(at + 1)
}

/** Accent the last vowel: habla → hablá (for habláramos). */
const accentLast = (s: string) => {
  const at = s.search(/[aeiou][^aeiou]*$/)
  return at < 0 ? s : s.slice(0, at) + ({ a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' } as Record<string, string>)[s[at]] + s.slice(at + 1)
}

const asList = (c: string | string[]) => (Array.isArray(c) ? c : [c])

/* ---- the conjugator ----------------------------------------------------- */

type FiniteSimple = 'presente' | 'preterito' | 'imperfecto' | 'futuro' | 'condicional' | 'subj-presente' | 'subj-imperfecto' | 'subj-futuro' | 'imperativo'

/** Simple forms of one verb: six cells per tense, each a list of accepted forms. */
type Simple = Record<FiniteSimple, string[][]> & { ger: string; part: string }

export interface Conjugator {
  /** Accepted forms of one cell, the form to teach first. Empty when the cell does not exist. */
  conjugate(inf: string, tense: TenseId, person: Person, opts?: { refl?: boolean }): string[]
  table(inf: string, tense: TenseId, opts?: { refl?: boolean }): string[][]
  gerund(inf: string): string
  participle(inf: string): string
  spec(inf: string): VerbSpec
  /** The persons a verb is drilled in, respecting gustar-type and weather verbs. */
  persons(inf: string, tense: TenseId): Person[]
}

/**
 * `spelling: false` skips the spelling rules (busc+é stays buscé), producing
 * the forms a learner writes when they forget them. Only the answer checker
 * wants that.
 */
export function createConjugator(specs: VerbSpecs, opts: { spelling?: boolean } = {}): Conjugator {
  const cache = new Map<string, Simple>()
  const join = opts.spelling === false ? (stem: string, ending: string) => stem + ending : spell

  const spec = (inf: string): VerbSpec => specs[inf] ?? {}

  function simple(inf: string): Simple {
    const hit = cache.get(inf)
    if (hit) return hit
    const s = spec(inf)
    const out = s.base ? prefixed(inf, s) : build(inf, s)
    cache.set(inf, out)
    return out
  }

  /** mantener = man + tener, re-accented where the prefix moves the stress. */
  function prefixed(inf: string, s: VerbSpec): Simple {
    const base = s.base!
    if (!inf.endsWith(base)) throw new Error(`${inf}: base "${base}" is not its ending`)
    const pre = inf.slice(0, -base.length)
    const b = simple(base)
    const p = (f: string) => prefix(pre, f)
    const six = (t: string[][]) => t.map((cell) => cell.map(p))
    const out: Simple = {
      presente: six(b.presente),
      preterito: six(b.preterito),
      imperfecto: six(b.imperfecto),
      futuro: six(b.futuro),
      condicional: six(b.condicional),
      'subj-presente': six(b['subj-presente']),
      'subj-imperfecto': six(b['subj-imperfecto']),
      'subj-futuro': six(b['subj-futuro']),
      imperativo: six(b.imperativo),
      ger: s.ger ?? p(b.ger),
      part: s.part ?? p(b.part),
    }
    if (s.impTu) out.imperativo[1] = [s.impTu]
    return out
  }

  function build(inf: string, s: VerbSpec): Simple {
    const plain = stripAccents(inf)
    const conj = plain.slice(-2) as Conj
    if (!['ar', 'er', 'ir'].includes(conj)) throw new Error(`"${inf}" is not an infinitive`)
    const stem = plain.slice(0, -2)

    const boot = s.stem ? changeStem(stem, s.stem, false) : s.accent ? accentStem(stem) : stem
    // -ir stem-changers narrow the vowel where the stress falls on the ending:
    // sintió, durmiendo, pidamos.
    const narrows = conj === 'ir' && s.stem !== undefined && s.stem !== 'u>ue'
    const narrow = narrows ? changeStem(stem, s.stem!, true) : stem

    // conocer → conozco, traducir → traduzco. hacer and decir have their own yo.
    const zc = conj !== 'ar' && /[aeiou]c$/.test(stem)
    const yo = s.yo ?? (zc ? stem.slice(0, -1) + 'zco' : undefined)
    const ducir = plain.endsWith('ducir')

    const presente: string[] = PRESENT[conj].map((e, p) =>
      p === 0 && yo ? yo : join(BOOT.has(p) ? boot : stem, e, conj)
    )

    const subjStem = s.subj ?? (yo ? yo.replace(/o$/, '') : undefined)
    const subj: string[] = SUBJUNCTIVE[conj].map((e, p) =>
      subjStem !== undefined ? subjStem + e : join(BOOT.has(p) ? boot : narrow, e, conj)
    )

    const pretStem = s.pret ?? (ducir ? stem.slice(0, -1) + 'j' : undefined)
    const preterito: string[] = pretStem
      ? STRONG.map((e, p) => pretStem + (p === 5 && pretStem.endsWith('j') ? 'eron' : e))
      : PRETERITE[conj].map((e, p) => join(p === 2 || p === 5 ? narrow : stem, e, conj))

    const imperfecto: string[] = IMPERFECT[conj].map((e) => (s.impf ?? stem) + e)

    const futStem = s.fut ?? plain
    const futuro = FUTURE.map((e) => futStem + e)
    const condicional = CONDITIONAL.map((e) => futStem + e)

    const ger = s.ger ?? join(narrow, conj === 'ar' ? 'ando' : 'iendo', conj)
    const part = s.part ?? join(stem, conj === 'ar' ? 'ado' : 'ido', conj)

    // Computed forms lose the accent a monosyllable never carries (vió → vio);
    // overrides are authored and used exactly as written. Both happen before
    // anything is derived from these tenses.
    const cells = (computed: string[][], t: SimpleTense): string[][] =>
      computed.map((cell, p) => {
        const o = s.forms?.[t]?.[p]
        return o === undefined || o === null ? cell.map(fixMonosyllable) : asList(o)
      })
    const one = (forms: string[]) => forms.map((f) => [f])

    const pres = cells(one(presente), 'presente')
    const pret = cells(one(preterito), 'preterito')
    const sub = cells(one(subj), 'subj-presente')

    // Imperfect subjunctive: ellos preterite minus -ron, plus -ra or -se.
    // The literary future subjunctive takes -re from the same root.
    const root = pret[5][0].replace(/ron$/, '')
    const fromRoot = (...endings: string[]) =>
      ['', 's', '', 'mos', 'is', 'n'].map((e, p) => {
        const r = p === 3 ? accentLast(root) : root
        return endings.map((x) => r + x + e)
      })
    const subjImpf = fromRoot('ra', 'se')
    const subjFut = fromRoot('re')

    const imperativo: string[][] = [
      [],
      [s.impTu ?? pres[2][0]],
      sub[2],
      sub[3],
      [inf.slice(0, -1) + 'd'],
      sub[5],
    ]

    return {
      presente: pres,
      preterito: pret,
      imperfecto: cells(one(imperfecto), 'imperfecto'),
      futuro: one(futuro),
      condicional: one(condicional),
      'subj-presente': sub,
      'subj-imperfecto': subjImpf,
      'subj-futuro': subjFut,
      imperativo: cells(imperativo, 'imperativo'),
      ger,
      part,
    }
  }

  const COMPOUND: Partial<Record<TenseId, FiniteSimple>> = {
    perfecto: 'presente',
    pluscuamperfecto: 'imperfecto',
    'futuro-perfecto': 'futuro',
    'condicional-compuesto': 'condicional',
    'subj-perfecto': 'subj-presente',
    'subj-pluscuamperfecto': 'subj-imperfecto',
  }

  function conjugate(inf: string, tense: TenseId, person: Person, opts: { refl?: boolean } = {}): string[] {
    const refl = opts.refl ?? false
    const s = simple(inf)
    const pron = PRONOUNS[person]
    const withPron = (forms: string[]) => (refl ? forms.map((f) => `${pron} ${f}`) : forms)

    if (isCommand(tense)) {
      if (person === 0 || spec(inf).noCommand) return []
      if (tense === 'imperativo-negativo') {
        return s['subj-presente'][person].map((f) => (refl ? `no ${pron} ${f}` : `no ${f}`))
      }
      const forms = s.imperativo[person]
      if (!refl) return forms
      return forms.map((f) => {
        // sentemos + nos → sentémonos; sentad + os → sentaos, but id + os → idos.
        if (person === 3) return attach(f, 'nos', 1)
        if (person === 4) return f === 'id' ? 'idos' : attach(f, 'os', 1)
        return attach(f, pron)
      })
    }

    const aux = COMPOUND[tense]
    if (aux) return withPron(simple('haber')[aux][person]).map((h) => `${h} ${s.part}`)
    return withPron(s[tense as FiniteSimple][person])
  }

  return {
    conjugate,
    table: (inf, tense, opts) => PERSONS.map((p) => conjugate(inf, tense, p, opts)),
    gerund: (inf) => simple(inf).ger,
    participle: (inf) => simple(inf).part,
    spec,
    persons(inf, tense) {
      const only = spec(inf).only
      const all = isCommand(tense) ? PERSONS.filter((p) => p !== 0) : PERSONS
      if (only === 'impersonal') return all.filter((p) => p === 2)
      if (only === 'third') return all.filter((p) => p === 2 || p === 5)
      return [...all]
    },
  }
}
