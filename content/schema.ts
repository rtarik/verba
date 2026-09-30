/**
 * The single source of truth for content shape.
 *
 * Both consumers derive from this file and nothing else:
 *   - scripts/validate.ts  (standalone, no app code)
 *   - src/lib/content.ts   (the app's only content adapter)
 *
 * App types come from z.infer here, so validator rules and TypeScript types
 * cannot drift apart.
 */
import { z } from 'zod'
import { TENSE_IDS, TENSES, type VerbSpec } from '../engine/conjugate.ts'

/** A real Spanish word: hoverable, trackable, and time-synced to audio. */
export const zWordToken = z.object({
  k: z.literal('w'),
  /** Word index. Sequential 0..n-1 across word tokens only, ignoring punctuation. */
  i: z.number().int().nonnegative(),
  /** Surface form exactly as printed, e.g. "llamo". */
  s: z.string().min(1),
  /** Dictionary form used for vocabulary tracking, e.g. "llamar". */
  lemma: z.string().min(1),
  /** Short English gloss shown on hover. */
  gloss: z.string().min(1),
  /**
   * Part of speech. Two values are load-bearing rather than cosmetic:
   * 'name' (proper nouns) and 'suffix' (meta-linguistic fragments such as the
   * quoted «-ron» in a text about verb endings) are excluded from vocabulary
   * tracking and from the progressive gate.
   */
  pos: z.string().optional(),
  /** Optional longer explanation, e.g. why this form is reflexive. */
  note: z.string().optional(),
  /**
   * Verbs only, added by the build from the conjugation engine: every
   * reading of the form (hable → present subjunctive, yo or él). A form of
   * haber and the participle after it share one compound-tense reading.
   */
  morph: z
    .array(
      z.object({
        tense: z.string(),
        persons: z.array(z.number().int().min(0).max(5)).optional(),
        compound: z.string().optional(),
      })
    )
    .optional(),
})

/** Punctuation and spacing. Rendered, never hoverable or tracked. */
export const zPunctToken = z.object({ k: z.literal('p'), s: z.string().min(1) })

/** Paragraph break. */
export const zBreakToken = z.object({ k: z.literal('br') })

export const zToken = z.discriminatedUnion('k', [zWordToken, zPunctToken, zBreakToken])

/** A multi-word expression, so hovering can explain a group rather than a word. */
export const zPhrase = z
  .object({
    /** Inclusive range over word indices (token.i), not array positions. */
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    s: z.string().min(1),
    gloss: z.string().min(1),
    note: z.string().optional(),
  })
  .refine((p) => p.to >= p.from, { message: 'phrase.to must be >= phrase.from' })

/** Written by scripts/tts.py. Null until audio has been generated. */
export const zAudio = z.object({
  file: z.string().min(1),
  voice: z.string().min(1),
  rate: z.string(),
  duration: z.number().positive(),
  /** starts[i] = seconds at which word token i begins. Indexed by token.i. */
  starts: z.array(z.number().nonnegative()),
})

export const zText = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
    level: z.enum(['A1', 'A2', 'B1', 'B2']),
    unit: z.number().int().positive(),
    order: z.number().int().positive(),
    title: z.string().min(1),
    titleEn: z.string().min(1),
    blurbEn: z.string().min(1),
    grammarRefs: z.array(z.string()),
    /** Lemmas this text is allowed to introduce for the first time. */
    newLemmas: z.array(z.string()),
    tokens: z.array(zToken).min(1),
    phrases: z.array(zPhrase),
    translationEn: z.string().min(1),
    audio: zAudio.nullable(),
  })
  .superRefine((t, ctx) => {
    const words = t.tokens.filter((x) => x.k === 'w')

    // Word indices must be dense and sequential — audio timings and vocab
    // tracking both address words by this index.
    words.forEach((w, n) => {
      if (w.i !== n) {
        ctx.addIssue({
          code: 'custom',
          message: `word "${w.s}" has i=${w.i} but is word #${n} (indices must be sequential from 0)`,
        })
      }
    })

    for (const p of t.phrases) {
      if (p.to >= words.length) {
        ctx.addIssue({ code: 'custom', message: `phrase "${p.s}" ends at ${p.to}, past last word ${words.length - 1}` })
      }
    }

    // The drift guard: audio timings must cover exactly the words present.
    if (t.audio && t.audio.starts.length !== words.length) {
      ctx.addIssue({
        code: 'custom',
        message: `audio has ${t.audio.starts.length} timings for ${words.length} words — regenerate with: npm run content:audio`,
      })
    }
  })

/**
 * Shared dictionary, keyed by *surface form* as it appears in the texts
 * ("llamo", "llamas", "llamó"), each pointing at its dictionary form.
 *
 * This is where vocabulary lives. A text only needs `glosses` entries for
 * words whose meaning is specific to that context — everything else resolves
 * here, so text 6 does not have to re-gloss "mi", "es", "y" and "de".
 */
export const zLexiconEntry = z.object({
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  pos: z.string().min(1),
  level: z.enum(['A1', 'A2', 'B1', 'B2']).optional(),
  note: z.string().optional(),
})
export const zLexicon = z.record(z.string(), zLexiconEntry)

export const zUnit = z.object({
  unit: z.number().int().positive(),
  level: z.enum(['A1', 'A2', 'B1', 'B2']),
  title: z.string().min(1),
  titleEn: z.string().min(1),
  focus: z.array(z.string()),
  /** One line on what the unit covers. Shown for units not yet written. */
  summaryEn: z.string().optional(),
  /**
   * The unit's practice set: tenses drilled with the verbs from its texts.
   * Units that introduce a tense drill it; the others review the tenses their
   * texts lean on.
   */
  practice: z
    .object({
      tenses: z
        .array(z.enum(TENSE_IDS).refine((t) => !TENSES[t].readOnly, { message: 'this tense is read-only, not drilled' }))
        .min(1),
    })
    .optional(),
  /**
   * Reading order within the unit, and the spine of the progressive-vocabulary
   * walk. An empty list marks a unit as planned but not yet written — the
   * library renders those as "coming soon" rather than hiding them, so the
   * shape of the whole course is visible from the start.
   */
  textIds: z.array(z.string()),
})
export const zCurriculum = z.object({ units: z.array(zUnit) })

/**
 * Grammar sections, in the order they are displayed. Keeping this a closed set
 * (rather than free text) is what stops the reference fragmenting into thirty
 * ad-hoc headings as it grows.
 *
 * 'Conjugation reference' is deliberately last and deliberately different: the
 * other sections teach, one idea per page, and their tables are cut down to the
 * forms a learner needs at that moment. These are lookup tables — every person
 * including `vosotros`, every irregular spelled out, and the same verb repeated
 * across pages on purpose. Redundancy is the feature; you should never have to
 * hold two pages in your head at once to conjugate something.
 */
export const GRAMMAR_CATEGORIES = [
  'Verbs',
  'Nouns & articles',
  'Pronouns & possessives',
  'Numbers & time',
  'Sentences & questions',
  'Conjugation reference',
] as const

export const zGrammarMeta = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  level: z.enum(['A1', 'A2', 'B1', 'B2']),
  category: z.enum(GRAMMAR_CATEGORIES),
  /** Sort order within the category. Lower comes first. */
  order: z.number().int().nonnegative().default(50),
  related: z.array(z.string()).default([]),
})

export type GrammarCategory = (typeof GRAMMAR_CATEGORIES)[number]

export type WordToken = z.infer<typeof zWordToken>
export type Token = z.infer<typeof zToken>
export type Phrase = z.infer<typeof zPhrase>
export type Audio = z.infer<typeof zAudio>
export type Text = z.infer<typeof zText>
export type LexiconEntry = z.infer<typeof zLexiconEntry>
export type Lexicon = z.infer<typeof zLexicon>
export type Unit = z.infer<typeof zUnit>
export type Curriculum = z.infer<typeof zCurriculum>
export type GrammarMeta = z.infer<typeof zGrammarMeta>

/** Word tokens only, in reading order. Shared by app and scripts. */
export const wordsOf = (t: Text): WordToken[] => t.tokens.filter((x): x is WordToken => x.k === 'w')

/* ------------------------------------------------------------------ *
 * Authoring source
 *
 * What a human (or Claude) actually writes. Prose stays prose so git
 * diffs read like Spanish rather than like a token array. `npm run
 * content:build` compiles this into the zText above.
 * ------------------------------------------------------------------ */

/** Gloss for one surface form, e.g. "llamo" -> lemma "llamar". */
export const zGlossEntry = z.object({
  lemma: z.string().min(1),
  gloss: z.string().min(1),
  pos: z.string().optional(),
  note: z.string().optional(),
})

export const zSourcePhrase = z.object({
  s: z.string().min(1),
  gloss: z.string().min(1),
  note: z.string().optional(),
  /** Word index of the phrase start. Required only when `s` occurs more than once. */
  at: z.number().int().nonnegative().optional(),
})

export const zSourceText = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
  level: z.enum(['A1', 'A2', 'B1', 'B2']),
  unit: z.number().int().positive(),
  order: z.number().int().positive(),
  title: z.string().min(1),
  titleEn: z.string().min(1),
  blurbEn: z.string().min(1),
  grammarRefs: z.array(z.string()).default([]),
  newLemmas: z.array(z.string()).default([]),
  /** The Spanish text. Blank line = paragraph break. */
  body: z.string().min(1),
  /** Surface form -> gloss. Overrides the lexicon for context-specific meaning. */
  glosses: z.record(z.string(), zGlossEntry).default({}),
  phrases: z.array(zSourcePhrase).default([]),
  translationEn: z.string().min(1),
})

/**
 * Audio sidecar, written by scripts/tts.py to content/audio/<id>.json.
 *
 * Kept out of the text source deliberately: `bodyHash` pins timings to the
 * exact prose they were generated from, so editing a sentence marks the audio
 * stale (a clear validator warning) instead of silently desyncing playback.
 */
export const zAudioSidecar = z.object({
  id: z.string().min(1),
  voice: z.string().min(1),
  rate: z.string(),
  duration: z.number().positive(),
  starts: z.array(z.number().nonnegative()),
  bodyHash: z.string().min(1),
})

export type GlossEntry = z.infer<typeof zGlossEntry>
export type SourcePhrase = z.infer<typeof zSourcePhrase>
export type SourceText = z.infer<typeof zSourceText>
export type AudioSidecar = z.infer<typeof zAudioSidecar>

/* ------------------------------------------------------------------ *
 * Verbs
 *
 * content/verbs.json lists only what each irregular verb does differently;
 * engine/conjugate.ts derives everything else. The zod shape and the
 * engine's interface are pinned together below, so neither can drift.
 * ------------------------------------------------------------------ */

const zCell = z.union([z.string().min(1), z.array(z.string().min(1)).min(1), z.null()])
const zSix = z.array(zCell).length(6)

export const zVerbSpec = z
  .object({
    base: z.string().optional(),
    stem: z.enum(['e>ie', 'o>ue', 'u>ue', 'e>i']).optional(),
    accent: z.boolean().optional(),
    yo: z.string().optional(),
    subj: z.string().optional(),
    pret: z.string().optional(),
    fut: z.string().optional(),
    impf: z.string().optional(),
    part: z.string().optional(),
    ger: z.string().optional(),
    impTu: z.string().optional(),
    forms: z
      .object({
        presente: zSix.optional(),
        preterito: zSix.optional(),
        imperfecto: zSix.optional(),
        'subj-presente': zSix.optional(),
        imperativo: zSix.optional(),
      })
      .strict()
      .optional(),
    refl: z.boolean().optional(),
    only: z.enum(['third', 'impersonal']).optional(),
    noCommand: z.boolean().optional(),
    drillIn: z.array(z.enum(TENSE_IDS)).optional(),
    gloss: z.string().optional(),
  })
  .strict()
export const zVerbSpecs = z.record(z.string(), zVerbSpec)

// Compile-time guarantee that verbs.json's schema is exactly what the engine reads.
const _specsAgree: [VerbSpec, z.infer<typeof zVerbSpec>] = [{} as z.infer<typeof zVerbSpec>, {} as VerbSpec]
void _specsAgree

/** One drillable verb, as the build emits it for the app. */
export interface VerbEntry {
  inf: string
  gloss: string
  level: 'A1' | 'A2' | 'B1' | 'B2'
}
