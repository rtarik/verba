# Verbal — Execution Plan

Spanish-from-zero reading app. Progressive AI-generated texts with hover translation,
karaoke-synced audio, a grammar reference, and vocabulary stats. Static site, no backend,
published on GitHub Pages.

---

## 0. Decisions locked in

| Area | Choice | Why |
|---|---|---|
| Stack | Vite + React + TypeScript + Tailwind | Leanest path to a static SPA; no SSR need; trivial GH Pages build |
| Hosting | GitHub Pages via GitHub Actions | Chosen. Requires `base` path config (see §1.3) |
| Audio | `edge-tts`, voice **es-ES-ElviraNeural** at `-15%` | Validated: natural Spanish, **and emits word-level timings**. `es-MX-DaliaNeural` is the approved alternate |
| Sync | Karaoke word highlighting | Highest-value beginner feature; solved for free by the timings above |
| Persistence | `localStorage` + JSON export/import | No backend; progress survives across sessions, and is portable |
| Content authoring | Generated in-session by Claude into versioned JSON | No API key, no runtime cost, fully reviewable in git |
| Content coupling | Standalone package, validated independently of the app | Content must be swappable and iterable without touching UI code (§1.6) |

### The audio finding that shapes everything

A live probe (`es-ES-ElviraNeural`, rate `-15%`) produced **25 word-boundary events for exactly
25 word tokens**, with accents preserved (`periódico`, `Dónde`) and punctuation consistently
stripped. Timings look like:

```
0.109s +0.265s  'Me'
0.374s +0.412s  'llamo'
0.785s +0.279s  'Ana'
2.294s +0.382s  'Vivo'
```

Because the event sequence maps 1:1 onto word tokens in order, **karaoke highlighting needs no
forced alignment, no ML, no Whisper step** — just index matching. This removes what would
otherwise have been the single largest technical risk in the project.

Note: `edge_tts.Communicate(...)` defaults to `boundary="SentenceBoundary"`. Word timings only
appear when `boundary="WordBoundary"` is passed explicitly.

### One honest caveat, since this will be published

`edge-tts` is an unofficial client for the endpoint behind Edge's "Read aloud". It is free and
key-less, but Microsoft's terms do not clearly grant redistribution of the generated audio from
a public site. Practically:

- Audio is generated **once at build time** and committed as static MP3s. The live site never
  calls Microsoft, so there is no runtime dependency or breakage risk.
- For personal learning this is a non-issue.
- If the site later gets real traffic and you want to be unambiguously clean, the fallback is
  **Kokoro-82M (Apache-2.0)** or **Piper (MIT)**. Cost of that swap is real but bounded: those
  models do not emit word boundaries, so we would add a forced-alignment step
  (WhisperX) to regenerate `timings`. Everything else — content, tokens, UI — is untouched.

Recommendation: build on `edge-tts` now, keep the TTS step isolated behind one script so the
swap stays a one-file change.

---

## 1. Phase 1 — Skeleton

Goal: a deployed, empty-but-working app. One hand-written sample text proves every seam.

### 1.1 Data model

The token model is the core abstraction. Text is **pre-tokenized at build time**, never split in
the browser — that keeps hover targets, audio timings, and vocab tracking all keyed to the same
stable index.

```ts
type Token =
  | { k: 'w'; i: number; s: string; lemma: string; gloss: string; pos?: string; note?: string }
  | { k: 'p'; s: string }     // punctuation, spaces
  | { k: 'br' }               // paragraph break

interface Phrase {            // multi-word expressions: "hover a group of words"
  from: number; to: number    // inclusive token-index range
  s: string; gloss: string; note?: string
}

interface Text {
  id: string                  // 'a1-u1-01-me-llamo-ana'
  level: 'A1' | 'A2' | 'B1'
  unit: number; order: number
  title: string; titleEn: string
  blurbEn: string             // what you'll learn here
  grammarRefs: string[]       // ids into the grammar section
  newLemmas: string[]         // vocabulary this text introduces
  tokens: Token[]
  phrases: Phrase[]
  translationEn: string       // full translation, revealed on demand
  audio: { file: string; duration: number; starts: number[] }  // starts[] indexed by token.i
}
```

Hover resolution: on a word, check whether its index falls inside a `Phrase` range. If it does,
show the phrase gloss **and** the word gloss; otherwise just the word. That satisfies
"hovering on a word or a group of words" with one pass and no ambiguity.

### 1.2 Repo layout

```
verba/
  content/
    lexicon.json              # master vocabulary: lemma -> gloss, pos, level, first-seen
    texts/a1/u1-01.json
    grammar/a1/ser-vs-estar.md
  public/audio/*.mp3
  scripts/
    tts.py                    # edge-tts -> mp3 + starts[]; the only TTS-aware file
    validate.ts               # schema + progressive-vocabulary gate (see §2.2)
  src/
    routes/       Library  Reader  Grammar  Stats
    components/   Reader/ WordToken/ HoverCard/ Player/ ProgressBar/
    lib/          storage.ts  vocab.ts  audio.ts  content.ts
  .github/workflows/deploy.yml
```

### 1.3 GitHub Pages specifics

- Name is **Verba**, matching the existing folder. Vite uses `base: './'` rather than a
  hardcoded `/verba/`: all emitted paths are relative, so the built site runs from a Pages
  subpath or any other static host. Verified by serving `dist/` at a `/verba/` subpath — index,
  JS, CSS and MP3 all 200, audio resolving as `./audio/...`. Nothing is coupled to the repo name.
- **Opening from disk needs its own build.** Relative paths are necessary but not sufficient:
  browsers block ES module *loading* over `file://` (opaque origin -> CORS failure), so the
  code-split module build renders a blank page when double-clicked. `npm run build:offline`
  emits a single self-contained `index.html` with CSS and JS inlined and code splitting off;
  an inline module has nothing to fetch. Audio stays external beside it.
- SPA routing: use `HashRouter`. GH Pages has no rewrite rules, so a deep link to
  `/verba/read/a1-u1-01` would 404 on refresh with a normal router. Hash routing sidesteps this
  entirely. (Alternative — copy `index.html` to `404.html` — gives cleaner URLs; easy to switch later.)
- Deploy via Actions on push to `main`.

### 1.4 Vocabulary + stats engine

Two states per lemma: `unknown` (default) and `known`.

Looking a word up is what teaches it, so **resting the cursor on a word marks it known** and it
loses its highlight; hovering any word of a phrase covers the whole phrase. Clicking toggles a
word back. There is no intermediate "learning" tier — reading is the review.

- Unknown words get a subtle tint; known words render plain. Progress becomes visible *in the
  text you're reading*, not just on a stats page.
- A short dwell delay guards the auto-marking, so sweeping the cursor across a line does not
  mark the line known. Verified: a 90ms-per-word sweep marks nothing; a 700ms rest marks.
- The lookup card is non-interactive by design, so it never intercepts a click on the text.
- `localStorage` holds `{ lemma: { status, firstSeen, lastSeen, seenCount } }`.
- Export/import as JSON so a browser reset doesn't wipe months of progress.

### 1.6 Content as a standalone package

Requirement: content must be swappable and extendable without touching app code, and validatable
on its own. Four rules enforce that.

**1. One schema, two consumers.** `content/schema.ts` defines zod schemas; the app derives its
TypeScript types from them via `z.infer`. App types and validator rules cannot drift apart,
because there is only one definition.

**2. The validator never imports app code.** `scripts/validate.ts` runs under `tsx` against
`content/` alone — no React, no Vite, no DOM. It can run in a bare CI job, in a pre-commit hook,
or standalone while the dev server is off:

```
npm run content:check
```

**3. Auto-discovery, no registry.** The app finds texts with `import.meta.glob` over
`content/texts/**/*.json`, ordered by `content/curriculum.json`. Adding a text means dropping in
a file and listing it in the curriculum — zero code changes, no import to remember.

**4. One adapter.** Components never touch raw JSON shapes; everything goes through
`src/lib/content.ts`. If the content format changes, exactly one app file changes with it.

Consequence worth stating plainly: content can be regenerated wholesale — every text rewritten,
the curriculum reordered, a different voice used throughout — and the app keeps working as long
as `content:check` passes. That check becomes the contract between the two halves.

### 1.5 Phase 1 exit criteria

- [x] One sample text renders from JSON with hover glosses working
- [x] Audio plays with words highlighting in time — verified tracking
      `Hola → llamo → de → España → Vivo → Madrid` against the audio clock
- [x] Clicking words changes status and persists across reload
- [x] Stats page shows real counts from that one text (2 known, 8% readiness)
- [x] `npm run content:check` passes standalone, with no app code loaded,
      and fails correctly on all five rule violations
- [ ] Deployed to GitHub Pages — workflow written, awaiting first push

**Implementation note.** The first karaoke build drove highlighting from
`requestAnimationFrame` alone. That fails whenever the tab is backgrounded: rAF is suspended
entirely (measured: zero ticks in 4.8s of playback), so a listener who switches tabs returns to
a frozen highlight and progress bar. Playback is now driven by `timeupdate` as well — rAF for
smoothness while visible, `timeupdate` as the floor when it is not.

---

## 2. Phase 2 — Content generation

### 2.1 Curriculum shape

Vocabulary-controlled and cumulative. Each text introduces **8–12 new lemmas**; everything else
must already have appeared. Text length grows with level.

| Unit | Focus | Words/text |
|---|---|---|
| A1 U1 | greetings, `ser`, pronouns, gender & articles | 40–60 |
| A1 U2 | present tense, reflexives, telling the time | 30–45 |
| A1 U3 | places, `hay` vs `estar`, directions, numbers | 60–80 |
| A1 U4 | `gustar` properly, `querer`/`poder`, quantities | 70–90 |
| A2 U5 | `pretérito indefinido` | 90–120 |
| A2 U6 | `imperfecto`, and contrasting the two pasts | 110–140 |
| A2 U7 | future, conditional, `por`/`para` | 130–160 |
| A2 U8 | objects pronouns, comparatives, travel | 150–180 |
| B1 U9 | present subjunctive: wishes, doubt, emotion | 170–200 |
| B1 U10 | imperfect subjunctive, conditional sentences | 190–220 |
| B1 U11 | relative clauses, connectors, opinions | 200+ |
| B2 U12 | formal register, reported speech, passives | 220+ |
| B2 U13 | concession, advanced connectors, hedging | 240+ |
| B2 U14 | literary tenses, register, idiom | 260+ |

All 14 units are declared in `curriculum.json` from the start, with the unwritten ones carrying
an empty `textIds`. The library renders those as **Coming soon** rather than hiding them, so the
shape of the whole course is visible on day one. Word counts above are targets: texts should
lengthen as the cumulative lexicon grows, leaning on words already met rather than on new ones.

### 2.2 The progressive guarantee, machine-checked

`scripts/validate.ts` walks texts in curriculum order maintaining a cumulative lexicon, and
**fails the build** if a text uses a lemma that is neither previously introduced nor in its own
`newLemmas`. This is the piece that makes "progressive" a property the repo enforces rather than
something we hope holds after 60 hand-written texts. It also catches the subtler failure mode:
quietly reusing a word two units before it was taught.

Additional gates in the same script:
- every word token has a non-empty `gloss` and `lemma`
- every `grammarRefs` id resolves to a real grammar doc
- `starts.length` matches the word-token count (catches TTS drift)

### 2.3 Audio pipeline

`scripts/tts.py` per text: synthesize at `-15%` rate → collect `WordBoundary` events → **assert
event count equals word-token count** → write MP3 and `starts[]` back into the text JSON.

That assertion is the safety net. The known ways the 1:1 mapping can break are digits (`25` is
spoken as one word but written as one token — fine — while `1995` may not be), abbreviations, and
hyphenated forms. Mitigation is simply to spell numbers out in the Spanish text, which is better
practice for a learner anyway. If the assertion ever fires, the script names the offending text
instead of silently shipping audio that drifts out of sync.

Budget: ~400 KB per minute of audio. 60 texts averaging 90s ≈ **36 MB** committed — comfortable
against the ~1 GB GH Pages limit.

### 2.4 Grammar reference

Markdown per topic with frontmatter (`id`, `title`, `level`, `related`), loaded via
`import.meta.glob`. Each doc: plain-English explanation for someone who has never studied
grammar, tables, examples drawn from **words the reader has already met**, and back-links to the
texts that use it. Cross-linked both ways with `grammarRefs`.

### 2.5 Sequencing

Build a **vertical slice first**: Unit 1 complete (6 texts + audio + grammar docs + lexicon)
before scaling out. If anything about the pipeline is wrong, it surfaces at 6 texts, not 60.

**Status: A1 complete — Units 1–4.** 24 texts, 1,247 words, 287 lemmas, 17 grammar pages,
3.7 MB audio. Live at https://rtarik.github.io/verba/

The progression works as designed. Texts roughly doubled in length while the new-word budget
stayed flat, which is only possible because recycling rose to meet it:

| Unit | Avg length | Recycled vocabulary |
|---|---|---|
| 1 Hola, ¿qué tal? | 39 w | 43% |
| 2 Mi día | 34 w | 57% |
| 3 En la ciudad | 67 w | 72% |
| 4 La comida | 68 w | 74% |

That last column is the health metric for the course. If it ever falls while texts lengthen, new
vocabulary is being pushed too fast. Target for A2 is to hold 70–80% while texts grow toward
90–120 words.

Every unit stayed inside the 8–13 new-lemma band, and no text has ever failed the TTS
word-count assertion.

**Unit 1 detail.** 6 texts, 231 words, 81 lemmas, 7 grammar pages, 824 KB of audio
(137 KB average per text — extrapolating to ~8 MB for a 60-text course, comfortably inside the
GitHub Pages budget). All six passed the progressive-vocabulary gate on the first run, and all
six passed the TTS word-count assertion, dialogue with em-dashes included.

Vocabulary pacing after the foundational first text: 10, 10, 11, 12, 12 new lemmas — inside the
8–12 target throughout.

**Structural change made during authoring.** `content/lexicon.json` was originally keyed by
lemma and held only curated overrides, which meant each text had to gloss *every* word it
contained, including ones taught units earlier — text 6 would have re-glossed `mi`, `es`, `y`
and `de`. It is now the shared dictionary keyed by **surface form**, and a text's own `glosses`
carry only context-specific meaning. This was worth fixing before writing five texts rather
than after.

---

### 2.6 Navigation, added before scaling up

Retrofitting structure at 48 texts would have been far worse than doing it at 12, so this landed
between Units 1 and 2:

- **Grammar categories.** A closed set (`Verbs`, `Nouns & articles`, `Pronouns & possessives`,
  `Numbers & time`, `Sentences & questions`) declared in the schema and enforced by the
  validator, so the reference cannot fragment into ad-hoc headings as it grows. The grammar
  index groups by category and has a search box.
- **Library index.** A sticky sidebar listing all 14 units (written ones showing progress,
  planned ones dimmed), with the unit you are currently working through highlighted. Units in
  the main column collapse and expand, and **only the active unit is open on arrival** — the one
  holding your next unread text, or the last written unit once everything is read. Expansion
  survives navigating into a text and back, and resets on reload, at which point the active-unit
  default is correct again.
  Also: a "Continue" card, overall and per-unit progress, read checkmarks, and an A1–B2 level
  filter. On phones there is no side, so the index collapses behind a toggle rather than pushing
  "Continue" below the fold.
  Jump links scroll programmatically rather than via `href="#unit-3"` anchors, because hash
  routing owns the URL fragment and an anchor would be parsed as a route.
- **Theme control.** Three states — follow the system, force light, force dark — rather than a
  plain switch, so picking a theme once does not permanently sever the link to the OS setting.
  The dark palette is declared twice: under `prefers-color-scheme`, guarded by
  `:root:not([data-theme="light"])` so an explicit light choice still wins, and under
  `:root[data-theme="dark"]` so the toggle beats the system. A small blocking script in `<head>`
  applies the stored choice before first paint, so a chosen theme never flashes the other
  palette. Verified: forcing light while the OS prefers dark yields the light palette.
- **Reading completion.** A separate `verba.progress.v1` store: knowing every word in a text is
  not the same as having worked through it, and the library needs the second fact to know where
  to send you next. Marked explicitly, or automatically when the audio plays to the end.
- **Backups cover both stores.** Export/import/reset now carry vocabulary *and* reading
  progress; previously a reset would have silently dropped which texts had been read.

## 3. Phase 3 — Final touches

- Reading polish: adjustable text size, line height, serif/sans toggle, dark mode
- Player: speed control, A/B sentence repeat, click-a-word-to-seek-there
- Library: per-text "known-word coverage %" so you can see what's ready to read
- Stats: growth over time, per-unit mastery, most-seen-but-still-unknown words
- Review mode: flashcards drawn from `learning` words, in original sentence context
- A11y: keyboard navigation for hover cards, focus states, screen-reader labels
- Perf: lazy-load text JSON per route, preload only the current audio file
- SEO/meta, favicon, and an about page

---

## 4. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| edge-tts redistribution ambiguity | Medium | Build-time only; documented Kokoro/Piper + WhisperX fallback |
| Word-boundary count drift | Medium | Hard assertion in `tts.py`; spell out numerals |
| Vocabulary progression rot at scale | High | `validate.ts` gate in CI — the core defense |
| localStorage cleared, progress lost | Medium | JSON export/import; prompt to back up at milestones |
| Content volume (60 texts) is the real cost | High | Vertical slice first; generate unit-by-unit |

---

## 5. Immediate next step

Phase 1 skeleton: scaffold Vite + React + TS + Tailwind, wire the data model, hand-write one
sample text, and get it deployed to GitHub Pages with hover + karaoke + stats working end to end.
