/**
 * Standalone content check. Loads no app code, needs no dev server.
 *   npm run content:check
 * Exits non-zero on any error, so it drops straight into CI or a git hook.
 */
import { compileAll } from './lib/compile.ts'

const { texts, lexicon, curriculum, diagnostics } = compileAll()
const { errors, warnings } = diagnostics

const RED = '\x1b[31m', YEL = '\x1b[33m', GRN = '\x1b[32m', DIM = '\x1b[2m', OFF = '\x1b[0m'

if (warnings.length) {
  console.log(`\n${YEL}warnings (${warnings.length})${OFF}`)
  for (const w of warnings) console.log(`  ${YEL}!${OFF} ${w}`)
}
if (errors.length) {
  console.log(`\n${RED}errors (${errors.length})${OFF}`)
  for (const e of errors) console.log(`  ${RED}x${OFF} ${e}`)
}

const words = texts.reduce((n, t) => n + t.tokens.filter((x) => x.k === 'w').length, 0)
const withAudio = texts.filter((t) => t.audio).length

console.log(`\n${DIM}────────────────────────────────${OFF}`)
console.log(`  units      ${curriculum.units.length}`)
console.log(`  texts      ${texts.length}  ${DIM}(${withAudio} with audio)${OFF}`)
console.log(`  words      ${words}`)
console.log(`  lexicon    ${Object.keys(lexicon).length} lemmas`)
console.log(`${DIM}────────────────────────────────${OFF}`)

if (errors.length) {
  console.log(`\n${RED}content check failed${OFF}\n`)
  process.exit(1)
}
console.log(`\n${GRN}content check passed${OFF}\n`)
