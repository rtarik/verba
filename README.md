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
  lexicon.json     shared dictionary, keyed by surface form
  texts/           authoring sources: prose + context-specific glosses
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

Then fill in `body` and `phrases`, add any new words to `content/lexicon.json`, and run
`npm run content:check`.

### Where vocabulary lives

`content/lexicon.json` is the shared dictionary, keyed by the **surface form** as it appears in
the text (`llamo`, `llamas`, `llama`), each pointing at its dictionary form. Put every new word
there and later texts inherit it automatically.

A text's own `glosses` are only for meaning that is specific to *that* context — for example
`una` carrying the note "feminine, because 'ciudad' is a feminine noun". Without this split,
text 6 would have to re-gloss `mi`, `es`, `y` and `de`.

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

## Opening it without a server

`npm run dev` and `npm run preview` both need a local server. To get a copy you can just
double-click:

```bash
npm run build:offline
open dist-offline/index.html
```

That emits a single self-contained `index.html` (~470 KB) with the CSS and JS inlined and no
code splitting, plus the `audio/` folder beside it. Keep the two together.

**Why a separate build:** browsers block ES module loading over `file://` — each file is an
opaque origin, so a `<script type="module" src="...">` fails CORS and the page renders blank.
The normal build is code-split and module-based, so it cannot be opened directly. The offline
build inlines the module instead, and an inline module needs no fetch.

**Implementation note for anyone touching `scripts/build-offline.ts`:** the inlining must use a
replacer *function*, never a replacement string. In a string replacement `$&`, `$1` and
`` $` `` are substitution patterns, and the React and remark bundles contain `$&` inside their
own `.replace()` calls — a string replacement rewrites those and silently corrupts the bundle.

## Deployment

Pushing to `main` runs the content check, builds, and publishes to GitHub Pages.

`vite.config.ts` uses `base: './'`, so every emitted path is relative and the built site runs
unchanged from any of:

- `file:///path/to/dist/index.html` — just open it, no server
- `https://<user>.github.io/verba/` — or any other subpath
- any static host at any depth

Routing is hash-based, so no server rewrites are needed and refreshing a deep link works
everywhere. Nothing is coupled to the repository name.

## Reading model

A word starts **unknown** and highlighted. Resting the cursor on it shows what it means and
marks it **known**, so the highlight disappears — the text visibly empties out as you learn.
Hovering any word of a phrase covers the whole phrase. Clicking a word toggles it back.

The lookup card is deliberately non-interactive (`pointer-events: none`) so it can never sit
between the cursor and the text. There is a short dwell delay before a word counts as looked
up, so sweeping the cursor across a line does not mark the line known.
