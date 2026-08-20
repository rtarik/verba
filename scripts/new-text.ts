/**
 * Scaffolds a new text source file and registers it in the curriculum.
 *   npm run content:new -- --unit 1 --id gatos --title "Los gatos de Ana"
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './lib/compile.ts'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1] ?? '')
}

const unit = Number(args.get('unit') ?? 1)
const slug = args.get('id')
const title = args.get('title') ?? 'Untitled'
if (!slug) {
  console.error('Usage: npm run content:new -- --unit 1 --id <slug> --title "<Spanish title>"')
  process.exit(1)
}

const curriculumPath = join(ROOT, 'content', 'curriculum.json')
const curriculum = JSON.parse(readFileSync(curriculumPath, 'utf8'))
const target = curriculum.units.find((u: { unit: number }) => u.unit === unit)
if (!target) {
  console.error(`No unit ${unit} in curriculum.json — add the unit first.`)
  process.exit(1)
}

const order = target.textIds.length + 1
const id = `${String(target.level).toLowerCase()}-u${unit}-${String(order).padStart(2, '0')}-${slug}`
const dir = join(ROOT, 'content', 'texts', String(target.level).toLowerCase())
const file = join(dir, `u${unit}-${String(order).padStart(2, '0')}.json`)

if (existsSync(file)) {
  console.error(`${file} already exists.`)
  process.exit(1)
}

mkdirSync(dir, { recursive: true })
writeFileSync(
  file,
  JSON.stringify(
    {
      id, level: target.level, unit, order,
      title, titleEn: 'TODO',
      blurbEn: 'TODO — one sentence on what this text teaches.',
      grammarRefs: [],
      newLemmas: [],
      body: 'TODO — the Spanish text. A blank line starts a new paragraph.',
      glosses: {},
      phrases: [],
      translationEn: 'TODO — full English translation.',
    },
    null,
    2
  ) + '\n'
)

target.textIds.push(id)
writeFileSync(curriculumPath, JSON.stringify(curriculum, null, 2) + '\n')

console.log(`\ncreated  ${file.slice(ROOT.length + 1)}`)
console.log(`added    ${id} to unit ${unit}`)
console.log(`\nnext: write the body and glosses, then run\n  npm run content:check\n  npm run content:all\n`)
