# Test Coverage Analysis & Improvement Proposal

_Analysis date: 2026-07-26_

## 1. Executive summary

Jaisvik is a collection of ten self-contained kids' educational web apps (`index.html`
plus nine games) sharing one reward layer (`playkit.js`). It totals roughly **4,000 lines
of JavaScript** and currently has:

- **No automated tests** of any kind.
- **No test runner, `package.json`, or dependency manifest.**
- **No CI** (`.github/` is absent; history is a series of "Add files via upload" commits).

So effective test coverage is **0%**. Every regression today is caught only by a human
manually clicking through each app in a browser — and because several apps are
near-duplicates of each other, a fix in one is easy to forget in its twin (this has
already caused behavioural divergence, see §5).

This document (a) explains the one structural change that makes testing possible,
(b) ranks the logic that most needs tests, (c) lists concrete bugs that tests would have
caught, and (d) proposes a phased plan.

---

## 2. The core obstacle: nothing is importable

Every app embeds its logic inside an IIFE or a classic `<script>` block *inside the HTML
file*. `playkit.js` wraps everything in `(function(){ ... })()` and exposes only
`window.PlayKit = { win, miss, open, data }`. None of the pure logic — number spelling,
speech matching, scoring, question generation — is exported, so **it cannot be imported
by a test without loading a full browser DOM and screen-scraping the result.**

**The enabling first step is extraction:** move the pure logic into small ES modules that
both the app and the tests import. For example:

```
core/
  playkit-core.js   // stageIdx, nextAt, badge predicates, streak rollover, win() math
  text-match.js     // norm, lev, sim, heardIt / matches  (shared by reading-ladder + talk-time)
  spell.js          // enSpell, teSpell, roSpell  (from trace-abc)
  arithmetic.js     // compute, makeQuestion, finish-stats  (from maths-lab)
  scoring.js        // medal/verdict tiers, quiz-pool + distractor selection
```

The HTML files then `import` from these modules (or include them via `<script
type="module">`) instead of inlining the code. This is a mechanical refactor, it removes
the large-scale duplication described in §5, and it is the single highest-leverage change
for testability. **Nothing below can be unit-tested cheaply until this is done.**

---

## 3. Recommended tooling

- **Runner:** [Vitest](https://vitest.dev) with the `jsdom` environment. Vitest is chosen
  because much of the code touches browser globals (`localStorage`, `AudioContext`,
  `speechSynthesis`, `getBoundingClientRect`, `ImageData`), and jsdom + easy mocking cover
  those. Node's built-in `node:test` is a lighter alternative for the purely
  arithmetic/string modules if we want zero dependencies.
- **Coverage:** `vitest --coverage` (v8 provider) to track progress against a target.
- **CI:** a GitHub Actions workflow (`.github/workflows/test.yml`) running `npm test` on
  push/PR. There is currently no CI at all, so this is a net-new safety net.
- **Randomness/time:** `win()` and every `shuffle`/`rnd`/question generator depend on
  `Math.random()`, and `playkit.js` and several apps depend on `new Date()`. Tests should
  inject or stub these (Vitest `vi.spyOn(Math, 'random')`, `vi.setSystemTime`) so results
  are deterministic.

---

## 4. Priority areas to test (highest value first)

### P0 — `playkit.js` (shared by every app)

This is the single most impactful file: a bug here affects all ten apps. Pure/near-pure
logic worth pinning down:

- `stageIdx(n)` (dragon growth thresholds) — boundaries at 0, 11/12, 29/30, 59/60,
  109/110, 179/180, and large values.
- `nextAt(i)` / `stageFace(i)` — including the `✨🐉` "star dragon" pair at max stage and
  `null` at the top.
- The 10 `BADGES[].need()` predicates — each threshold, awarded exactly once.
- **Daily streak rollover** (`D.day !== today` block): played-yesterday increments the
  streak, a skipped day resets it to 0. Use a fixed system time.
- **`win(n)` accumulation**: combo increment, `bestCombo` tracking, the `combo >= 3`
  "double the star" bonus, `todayStars`/`stars` totals, and stage-up detection.
- `read`/`write` persistence with the in-memory fallback when `localStorage` throws.

### P1 — Speech / text matching (`reading-ladder`, `talk-time-kids`, `talk-time-kids-1`)

The fuzzy matchers decide whether a child "got it right," so false positives/negatives
here directly hurt the learning experience. All are pure given their inputs:

- `norm(s)` — lowercasing, punctuation stripping, whitespace collapse; **talk-time also
  strips stopwords** (`a|an|the|is|it|…`), which changes matching behaviour and needs its
  own cases.
- `lev(a,b)` (Levenshtein) and `sim(a,b)` (normalized similarity) — classic algorithms,
  easy to table-test.
- `heardIt(list, target)` (reading-ladder) and `matches(heard, target, accepts)`
  (talk-time) — the core voting logic. These are **fragile on short words** (e.g. "cat"
  vs "cap" similarity ≈ 0.66; the reverse-substring rule can match "re" → "red"). Tests
  should lock in intended accept/reject behaviour and guard against loosening.
- `fill(t)` (talk-time) — `{name}`/`{age}`/`{ageword}` template substitution, including
  the out-of-range-age fallback.

### P2 — Number spelling (`trace-abc`)

`enSpell(n)`, `teSpell(n)`, `roSpell(n)` convert 1–100 to words in English, Telugu, and
romanized Telugu. Pure, with clear boundaries: **1, 19, 20, 21, 99, 100**, plus the
out-of-range cases (`0`, `101`, non-integers) that currently produce `"undefined"`
fragments (see §5).

### P3 — Arithmetic & question generation (`maths-lab`)

- `compute(a,b,op)` — the four operations, including integer division via `Math.floor`.
- `makeQuestion()` — per-level range invariants and the guarantee that division problems
  are always exact (`a = d*q`). Stub `rnd` to assert bounds.
- `rnd(lo,hi)` — inclusive-range correctness.
- `finish()` result stats — **has a divide-by-zero bug** (see §5).

### P4 — Scoring, tiering, progression & selection (all quiz apps)

Repeated patterns worth a shared test module once extracted:

- Medal/verdict tiers: `finish` in `word-chart` (🏆/🌟/👍/🌱 at 1.0/0.7/0.4), `spelling-bee`
  (1.0/0.8/0.5), `maths-lab`, `reading-ladder`.
- Quiz-pool selection and distractor picking (`word-chart` `ask`/`startQuiz`,
  `spelling-bee` `startRound`) — correct answer always present, exactly N options,
  distractors distinct.
- `shuffle` (Fisher–Yates, appears in most files) — permutation validity, length
  preserved, all elements retained (mock `Math.random`).
- Bag-shuffle round logic in the `solar-system` Mission — no target repeats until the pool
  is exhausted.

### P5 — Geometry / coordinate math (`trace-abc`, `solar-system-speaks`)

Needs light mocking (`getBoundingClientRect`, `ImageData`) but is otherwise deterministic:

- `trace-abc` `check()` — stroke-coverage scoring: `cover`, `messy`, `score = max(0, cover
  - messy*0.35)` and the star tiers (`>=0.72→3`, `>=0.5→2`, `>=0.28→1`). Feed synthetic
  mask/ink arrays.
- `trace-abc` `pos(e)` — pointer→canvas coordinate transform.
- `solar-system` `clamp`, `baseFit`, `gap` (pinch distance), `apply` pan-clamping, and
  `bringIntoView` — pure given mocked element rects.

---

## 5. Bugs found during this analysis (tests would have caught these)

These were surfaced while surveying the code and are strong motivation for the suite:

1. **`playkit.js` — quest-complete celebration can be silently skipped.**
   `win()` (line 266) checks `D.todayStars === QUEST` (strict equality, `QUEST = 12`), but
   a combo streak adds **2 stars at once** (lines 246–248). So `todayStars` can jump
   `11 → 13`, never equalling 12, and the "Today's quest done 🎯" confetti + speech never
   fire — even though the `quest1` badge (which uses `>=`, line 63) *is* awarded. The two
   code paths disagree. Fix: use `>=` with a "already celebrated today" flag.

2. **`maths-lab` — divide-by-zero in results.**
   `finish()` computes `Math.round(secs / done)` for "seconds per question"; if the child
   quits on the very first question (`done === 0`) this is `Infinity`. `pct` is guarded but
   this stat is not.

3. **`measure-playground` — timer leak / null crash.**
   `timeGame()`'s `setInterval` is never `clearInterval`-ed on back-navigation. After
   leaving the screen the interval keeps firing against DOM nodes that `home()` replaced,
   so `$("clock")` is `null` and the callback throws.

4. **`measure-playground` — duplicate racers.**
   `speedGame()`'s fallback padding (`while(three.length < 3) three.push(RACERS[three.length])`)
   indexes the *original* array rather than the drawn pool, so it can inject a racer that's
   already on the track, producing an ambiguous "fastest."

5. **`solar-system-speaks` — planet names degrade to lowercase ids.**
   The appended Mission mini-game reads `window.WORLDS`, but the main script declares
   `const WORLDS` at script scope and never assigns it to `window`. `nameOf()` therefore
   falls back to the raw id, so banners and speech say "mercury" instead of "Mercury"
   throughout the mission.

6. **`trace-abc` — number spellers unguarded outside 1–100.**
   `enSpell(0)` → `""`, `enSpell(101)` → `"undefined One"`. Currently only called with
   1–100, but a latent trap for any future caller; a boundary test would document the
   contract.

7. **Large-scale duplication → divergence risk.**
   `word-chart.html` and `word-chart-2.html` are byte-identical except one calls
   `PlayKit.win()` and the other doesn't. `talk-time-kids.html` and `talk-time-kids-1.html`
   are near-identical, and they have **already diverged**: only one awards stars via
   `PlayKit.win(n)`. Extracting shared logic (per §2) collapses these into one tested
   module and removes the divergence surface.

---

## 6. Proposed phased plan

| Phase | Work | Outcome |
|-------|------|---------|
| **0. Infra** | Add `package.json`, Vitest + jsdom, a `test` script, and a GitHub Actions workflow. | `npm test` runs (green with zero tests); CI wired. |
| **1. Extract `playkit-core.js`** | Pull the pure logic out of `playkit.js`'s IIFE into an importable module; have `playkit.js` consume it. | P0 becomes testable. |
| **2. Cover P0** | Full tests for stages, badges, streak rollover, `win()` math. Fix bug #1. | Every app's reward layer is protected. |
| **3. Extract + cover P1–P3** | `text-match.js`, `spell.js`, `arithmetic.js`; table-driven tests; fix bugs #2, #6. | The learning-critical matchers and generators are pinned. |
| **4. Cover P4–P5** | Shared scoring/selection tests; geometry tests with mocked rects/ImageData; fix bugs #3, #4, #5. | Quiz flows and tracing/orrery math protected. |
| **5. De-duplicate** | Collapse the word-chart and talk-time twins onto the shared modules. | Bug #7 eliminated structurally. |

### Suggested first coverage target

Set an initial gate of **80% line coverage on the `core/` modules** (the extracted pure
logic), not on the whole repo — the DOM/audio/canvas rendering code is low-value to unit
test and better served by a few end-to-end smoke tests later. Raise the gate as extraction
proceeds.

---

## 7. What to *not* over-invest in

The rendering, audio (`beep`/`say`/`speak`), speech-recognition wiring, canvas drawing
(`strokeSeg`/`drawGuide`/`redraw`), and confetti/animation code is tightly DOM/hardware
coupled and low-risk. It's better covered by a handful of Playwright smoke tests ("each app
loads, the first question renders, a correct answer advances") than by brittle unit tests
with heavy mocks. Focus unit-testing effort on the pure logic in §4.
