/**
 * Compiles content/ into content/build/, which is what the app imports.
 * Refuses to emit anything if the corpus has errors.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { compileAll, ROOT } from './lib/compile.ts'

const { texts, lexicon, curriculum, diagnostics } = compileAll()

for (const w of diagnostics.warnings) console.log(`  ! ${w}`)
if (diagnostics.errors.length) {
  for (const e of diagnostics.errors) console.error(`  x ${e}`)
  console.error(`\ncontent build failed with ${diagnostics.errors.length} error(s)\n`)
  process.exit(1)
}

const OUT = join(ROOT, 'content', 'build')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'texts'), { recursive: true })

for (const t of texts) {
  writeFileSync(join(OUT, 'texts', `${t.id}.json`), JSON.stringify(t))
}
writeFileSync(join(OUT, 'lexicon.json'), JSON.stringify(lexicon, null, 2))

// Library index: everything needed to list and sort texts without loading them.
writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify(
    {
      units: curriculum.units,
      texts: texts.map((t) => ({
        id: t.id, level: t.level, unit: t.unit, order: t.order,
        title: t.title, titleEn: t.titleEn, blurbEn: t.blurbEn,
        grammarRefs: t.grammarRefs,
        wordCount: t.tokens.filter((x) => x.k === 'w').length,
        hasAudio: Boolean(t.audio),
        lemmas: [...new Set(t.tokens.flatMap((x) => (x.k === 'w' && x.pos !== 'name' ? [x.lemma] : [])))],
      })),
    },
    null,
    2
  )
)

// Manifest for scripts/tts.py. Python never tokenizes — it consumes the word
// list produced here, so there is exactly one tokenizer in the project.
writeFileSync(
  join(OUT, 'tts-manifest.json'),
  JSON.stringify(
    texts.map((t) => ({
      id: t.id,
      body: t.body,
      bodyHash: t.bodyHash,
      words: t.tokens.flatMap((x) => (x.k === 'w' ? [x.s] : [])),
      hasAudio: Boolean(t.audio),
    })),
    null,
    2
  )
)

console.log(`\ncontent build ok — ${texts.length} text(s), ${Object.keys(lexicon).length} lemmas -> content/build/\n`)
