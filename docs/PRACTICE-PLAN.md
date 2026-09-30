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
| Availability | Every tense and every course verb is always available — nothing waits on reading progress (unlocking was built in step 4, then removed) |

## Phase 1

- [x] **1. Conjugation engine** — every tense, commands with attached pronouns, prefixed verbs; `content/verbs.json` lists only irregularities; 173 golden checks
- [x] **2. Checked against the course** — every verb form in all 144 texts must be one the engine produces; runs in `content:check` and CI
- [x] **3. Answer checking and diagnosis** — accent policy; wrong person / wrong tense / missing pronoun / spelling rule / stem change / regularised irregular, each linked to its reference page
- [x] **4. Practice page** — `/practice`: tense chips, verb pool (all / irregular only / one verb); **Conjugate** and **Full table** modes; accent shortcuts; summary with "retry misses"
- [x] **5. Unit practice** — `practice.tenses` per unit in `curriculum.json` (validated); a Practice entry on each unit in the library, drilling the verbs from that unit's texts
- [x] **6. Mastery** — per tense × person × regularity store; heatmap on the Progress page (click a cell to drill it); **Weak spots** mode (~¼ of each set explores untried cells); drills and grammar-read state in export/import/reset
- [x] **7. Identify drill** — see `hubiera dicho`, name the verb (typed), tense and person (chips); ambiguous forms accept any reading and list them all; `-ra` and `-se` forms both appear. Recognition, so it does not feed the production heatmap

## Phase 2

- [x] Tense and person in the reader's hover card (`hubiera` → haber · pluperfect subj. · yo/él), with the tense's row and this form picked out. Worked out at build time for every verb in every text; `había` + `ido` read together as one compound tense
- [x] Fixed along the way: nouns tagged as verbs (`el trabajo` glossed "I work", `una pregunta` "asks"…) in 26 texts; `content:check` now warns on a verb straight after a determiner
- ~~Fill-the-blank from texts already read~~ — dropped
