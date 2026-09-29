# Practice — Plan

Conjugation and grammar drills, alongside the reading. Generated from a conjugation engine
rather than hand-written, so practice never runs out, and checked against the course so a
drill never asks for a form the engine gets wrong.

## Decisions locked in

| Area | Choice |
|---|---|
| Answering | Typing by default; choices only where recognition is the skill (Identify) |
| Persons | All six, `vosotros` included |
| Accents | A missing accent is right, with a warning — unless the accent is the only difference between two forms (`hablo` / `habló`), which is wrong |
| Placement | A **Practice** tab *and* a practice set at the end of each unit, sharing one engine |
| Unlocking | Tenses open once their grammar page (or a text linking to it) is read; verbs once the text introducing them is read. "Show everything" overrides both |

## Phase 1

- [x] **1. Conjugation engine** — every tense, commands with attached pronouns, prefixed verbs; `content/verbs.json` lists only irregularities; 173 golden checks
- [x] **2. Checked against the course** — every verb form in all 144 texts must be one the engine produces; runs in `content:check` and CI
- [x] **3. Answer checking and diagnosis** — accent policy; wrong person / wrong tense / missing pronoun / spelling rule / stem change / regularised irregular, each linked to its reference page
- [x] **4. Practice page** — `/practice`: tense chips (with unlocking), verb pool (met / irregular only / one verb); **Conjugate** and **Full table** modes; accent shortcuts; summary with "retry misses"
- [x] **5. Unit practice** — `practice.tenses` per unit in `curriculum.json` (validated); a Practice entry on each unit in the library, drilling the verbs from that unit's texts
- [ ] **6. Mastery** — per tense × person × regularity store; heatmap on the Progress page; **Weak spots** mode; drills in export/import (plus the grammar-read store, which export currently misses)
- [ ] **7. Identify drill** — see `hubiera dicho`, name the verb, tense and person; ambiguous forms accept any reading

## Phase 2

- [ ] Tense and person in the reader's hover card (`hubiera` → haber · pluperfect subj. · yo/él), linked to the table
- [ ] Fill-the-blank from texts already read, with the sentence's audio after answering

## Phase 3

- [ ] Hand-written **Which tense?** sets (indefinido / imperfecto, indicativo / subjuntivo…) tied to grammar pages
- [ ] Hand-written **Transform** sets (sequence of tenses, reported speech, the three conditionals)
- [ ] Dictation from existing audio
