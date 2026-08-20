# Verba

Learn Spanish from zero by reading. Progressive texts with hover translation, word-synced
audio, a grammar reference, and vocabulary tracking. Static site, no backend, no accounts.

## Getting started

```bash
npm install
npm run dev
```

## How the project is split

The app and the content are deliberately independent. Content can be rewritten wholesale
without touching a line of app code, and it is validated on its own.

```
content/
  schema.ts      one zod definition; the app derives its types from it
  curriculum.json  unit and reading order
  lexicon.json     curated glosses (optional overrides)
  texts/           authoring sources: prose + glosses
  audio/           timing sidecars written by the TTS script
  grammar/         markdown reference pages
  build/           compiled output the app imports (generated, gitignored)
scripts/
  lib/tokenize.ts  the single authority on what counts as a word
  lib/compile.ts   source -> tokens, plus every content rule
  validate.ts      standalone checker
  build.ts         writes content/build/
  tts.py           edge-tts narration + word timings
src/
  lib/content.ts   the app's only content adapter
```

## Content workflow

```bash
npm run content:check    # validate — no app code loaded, safe to run anytime
npm run content:build    # compile content/ -> content/build/
npm run content:audio    # generate narration + word timings for anything missing
npm run content:all      # build, generate audio, rebuild to attach timings
```

Adding a text:

```bash
npm run content:new -- --unit 1 --id mi-familia --title "Mi familia"
```

Then fill in `body`, `glosses`, and `phrases`, and run `npm run content:check`.

### What the checker enforces

- **Progressive vocabulary.** Walking texts in curriculum order, any word that was never
  introduced earlier and is not in that text's `newLemmas` is an error. This is what keeps the
  course genuinely progressive as it grows.
- Every word has a gloss and a lemma.
- Every `grammarRefs` id resolves to a real grammar page.
- Phrases actually occur in the body, and unambiguously.
- Audio timings match the words they belong to, and go stale visibly when prose is edited.

## Audio

Narration uses [`edge-tts`](https://github.com/rany2/edge-tts) — Microsoft's neural voices,
free and without an API key. Default voice is `es-ES-ElviraNeural` at `-15%` speed.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
npm run content:all
```

Word-level timings come from edge-tts `WordBoundary` events, which map one-to-one onto the
tokenizer's words — so karaoke highlighting needs no forced alignment. `tts.py` asserts that
mapping and refuses to write audio if it breaks. Write numerals as words (`veinticinco`, not
`25`) to keep it holding.

Generated MP3s and sidecars are committed, so CI needs neither Python nor network access.

## Deployment

Pushing to `main` runs the content check, builds, and publishes to GitHub Pages. The site is
served from a subpath, set as `base: '/verba/'` in `vite.config.ts` — rename the repo and that
value has to change with it.
