# Wordle Lab: Technical Specification and Implementation Plan

Source: [requirements.md](requirements.md). This document turns those requirements into concrete design decisions, interfaces, algorithms, and a build plan. Requirement IDs (e.g. `ENG-1`) are used to trace each item back to the brief and to tests.

---

## 1. Goals and non-goals

### Goals
- A Wordle game that you can play in the browser, backed by an HTTP API.
- A solver that lists the words still possible and ranks next guesses by expected information (entropy).
- Game and solver logic kept in a pure core library with no web dependencies, so the same code can be used from the API and from tests.
- Correctness backed by automated tests, especially for scoring words with repeated letters and for the entropy math.
- Runs locally with one install command and one start command.

### Non-goals
- Authentication, user accounts, persistence, databases, deployment.
- The brief's optional "simulate" stretch (running the solver against every answer); deliberately left out.
- Hard mode, daily puzzles, sharing, statistics history, animations beyond simple tile flips.
- Support for several languages or word lengths other than 5.

---

## 2. Technology choices

| Concern | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | One language for the core, the server, and the browser. Types document the API contract. |
| Runtime | Node.js ≥ 22 | Already installed locally (v26). No Python 3.9 limitations. |
| HTTP server | Express 5 | Small and well known. Error handling is easy to audit. |
| Frontend | Vanilla TypeScript + HTML + CSS, bundled with Vite | No framework is needed for a single page. Vite gives fast dev mode and a static build. |
| Tests | Vitest (unit + API), Supertest (HTTP) | Fast, TS-native, the same runner for every layer. |
| Boundary check | Vitest architecture test | Enforces that `core/` imports no web code, without a lint toolchain. |

All dependencies are pinned in `package.json` and locked by `package-lock.json`.

---

## 3. Architecture

```
┌──────────────────────┐      fetch/JSON      ┌──────────────────────┐
│  web/ (browser UI)   │ ───────────────────▶ │  server/ (Express)   │
│  board, keyboard,    │ ◀─────────────────── │  routes, validation, │
│  hint panel, errors  │                      │  in-memory game store│
└──────────────────────┘                      └──────────┬───────────┘
                                                         │ imports
                                              ┌──────────▼───────────┐
                                              │  core/ (pure TS)     │
                                              │  words, scoring,     │
                                              │  game, solver        │
                                              └──────────────────────┘
```

**Dependency rule (GR-2):** `core/` imports nothing from `server/` or `web/` and makes no Node-specific I/O calls, except in `core/wordlist.ts`, which takes file contents or a path through a loader function that can be injected. A test (`tests/core/architecture.test.ts`) enforces this.

### 3.1 Repository layout

```
wordle/
├── data/
│   ├── answers.txt          # possible secret words, one per line
│   └── allowed.txt          # additional valid guesses, one per line
├── src/
│   ├── core/
│   │   ├── types.ts         # shared types (Feedback, Pattern, GameState…)
│   │   ├── wordlist.ts      # parse + validate word lists
│   │   ├── score.ts         # scoreGuess, pattern encode/decode
│   │   ├── game.ts          # Game state machine
│   │   ├── solver.ts        # filterCandidates, rankGuesses
│   │   └── index.ts         # public API of the core
│   ├── server/
│   │   ├── app.ts           # Express app factory (no listen; testable)
│   │   ├── routes.ts        # route handlers
│   │   ├── errors.ts        # ApiError + error middleware
│   │   ├── store.ts         # in-memory GameStore
│   │   └── main.ts          # loads words, starts listening
│   ├── web/
│   │   ├── index.html
│   │   ├── main.ts          # bootstraps UI
│   │   ├── api.ts           # typed fetch client
│   │   ├── board.ts         # tile grid rendering
│   │   ├── keyboard.ts      # on-screen + physical keyboard
│   │   ├── hints.ts         # hint panel + remaining counter
│   │   └── styles.css
├── tests/
│   ├── core/…               # unit tests per core module
│   ├── server/…             # HTTP tests via supertest
│   └── fixtures/            # tiny word lists for deterministic tests
├── README.md
├── requirements.md
└── technical-requirement.md
```

---

## 4. Data: word lists

**Requirement:** ENG-3 (load the word list from a file).

- `data/answers.txt`: the set of possible secret answers (about 2,300 words).
- `data/allowed.txt`: extra words that are valid guesses but are never answers (about 10,000 words).
- **Allowed guesses** = `answers ∪ allowed`.
- File format: one word per line, UTF-8. Blank lines and lines starting with `#` are ignored. Words are trimmed and lowercased.
- Validation when loading (fail fast with a clear message that names the file and line):
  - every word matches `^[a-z]{5}$`
  - duplicates are removed, with a warning
  - the answers list is not empty
- Paths can be configured through the environment variables `ANSWERS_PATH` and `ALLOWED_PATH`, with the files above as defaults. Tests use small fixture lists.
- The README records where the lists came from and their licence.

```ts
interface WordList {
  answers: readonly string[];        // sorted, unique
  allowed: ReadonlySet<string>;      // answers ∪ extra guesses
  guessPool: readonly string[];      // sorted array of `allowed`, for solver iteration
}
function parseWordList(text: string, source: string): string[];
function loadWordList(answersPath: string, allowedPath?: string): WordList;
```

---

## 5. Core: scoring

**Requirement:** ENG-1.

### 5.1 Types
```ts
type Feedback = 'green' | 'yellow' | 'gray';
type Pattern = number;              // base-3 encoding, 0..242
```

### 5.2 Algorithm (handles repeated letters correctly)
Two passes over the five positions:

1. **Greens:** for each position `i`, if `guess[i] === answer[i]`, mark it green. Otherwise add `answer[i]` to a count of answer letters not yet matched.
2. **Yellows and grays:** for each position that is not green, if `counts[guess[i]] > 0`, mark it yellow and decrement the count. Otherwise mark it gray.

Each letter of the answer can only produce one green or yellow. Example: guess `speed` against answer `abide` gives `gray gray yellow gray yellow`. The answer has only one `e`, so only the first `e` in the guess is yellow and the second is gray. Example with a green: guess `eerie` against answer `elder` gives `green yellow yellow gray gray`. The answer has two `e`s: one is used by the green, one by the first yellow, so the third `e` in the guess is gray. See §10.1 for the full test table.

### 5.3 Pattern encoding
`pattern = Σ digit[i] · 3^i` where gray=0, yellow=1, green=2. All-green = 242. The integer form is used inside the solver for speed. `decodePattern(p): Feedback[]` converts it back for the API.

```ts
function scoreGuess(guess: string, answer: string): Feedback[];
function scorePattern(guess: string, answer: string): Pattern;   // no allocation, hot path
function encodePattern(f: Feedback[]): Pattern;
function decodePattern(p: Pattern): Feedback[];
```

---

## 6. Core: game state

**Requirement:** ENG-2.

```ts
type GameStatus = 'in_progress' | 'won' | 'lost';

interface GuessRecord { word: string; feedback: Feedback[]; }

interface GameState {
  id: string;
  status: GameStatus;
  guesses: GuessRecord[];
  maxGuesses: number;      // 6
  answer?: string;         // only exposed when status !== 'in_progress'
}

class Game {
  constructor(words: WordList, answer: string, opts?: { maxGuesses?: number });
  isAllowed(word: string): boolean;
  guess(word: string): GuessRecord;   // throws GameError
  get state(): GameState;
}

type GameErrorCode = 'INVALID_LENGTH' | 'INVALID_CHARACTERS' | 'NOT_IN_WORD_LIST' | 'GAME_OVER';
class GameError extends Error { code: GameErrorCode; }
```

**Rules**
- Input is trimmed and lowercased before validation.
- Validation order: game over → length ≠ 5 → characters other than a–z → not in `allowed`. The first failure is reported.
- An invalid guess **does not** use up an attempt.
- Repeating an earlier guess is allowed and counts as an attempt, as in standard Wordle.
- Status becomes `won` when the feedback is all green, and `lost` after `maxGuesses` guesses without a win.
- The answer is chosen by the caller (the server chooses at random, tests choose a fixed word), which keeps `Game` deterministic.

---

## 7. Core: solver

**Requirements:** SOL-1, SOL-2, SOL-3.

### 7.1 Candidate filtering (SOL-1)
A word `w` from `answers` is still possible if and only if, for every past guess `(g, f)`, `scorePattern(g, w) === encodePattern(f)`.

Defining it this way (consistency with every observed pattern) avoids special cases for repeated letters, because it uses the same `scorePattern` as the game.

```ts
function filterCandidates(answers: readonly string[], history: GuessRecord[]): string[];
```

### 7.2 Entropy ranking (SOL-2)
For a guess `g` and the remaining candidates `C` (|C| = n):

1. Split `C` into buckets by `scorePattern(g, c)`. Bucket `p` holds `count[p]` words.
2. `P(p) = count[p] / n`
3. `H(g) = −Σ_p P(p) · log2 P(p)` (bits)

Higher `H` means that, on average, the guess shrinks the candidate set more. The expected number of candidates left after the guess is `Σ count[p]² / n`, and this is returned too because it is easy to understand.

**Guess pool:** every allowed word (so a word that cannot be the answer can still be the most informative guess).

**Tie-break order** (deterministic):
1. higher entropy
2. the guess is itself a possible answer (it could win now)
3. alphabetical

**Edge cases**
- `n === 0`: the history contradicts every answer (this should not happen with the server). Return `remaining: 0` and no suggestions.
- `n === 1`: return the single candidate with entropy 0 and `isCandidate: true`.
- `n === 2`: either candidate is optimal. The tie-break picks a candidate.

```ts
interface Suggestion {
  word: string;
  entropy: number;            // bits, rounded to 3 dp at the API boundary
  expectedRemaining: number;
  isCandidate: boolean;
}
function rankGuesses(candidates: readonly string[], guessPool: readonly string[], topN = 10): Suggestion[];
```

### 7.3 Performance
- Worst case (first move): about 13,000 guesses × about 2,300 candidates ≈ 30M `scorePattern` calls. The target is under 1.5 s in Node, using an integer pattern, a reused `Uint16Array(243)` bucket array, and char-code arrays instead of strings.
- **Opening cache:** the ranking for an empty history is the same for every game, so it is computed once at startup (or lazily on the first request) and stored.
- After the first guess, `n` is usually under 200, so ranking takes milliseconds.
- If profiling shows a need, there is an optional optimisation: a precomputed `Uint8Array` pattern matrix of size |guessPool| × |answers| (≈ 30 MB), built at startup. It is **not** in the initial build; add it only if hints become too slow.

### 7.4 Hint explanation (the "explain why" part)
Each suggestion carries `entropy`, `expectedRemaining`, and `isCandidate`. The UI turns these into a sentence such as: *"CRANE: 5.87 bits; leaves ~ 61 words on average; could be the answer."*

---

## 8. HTTP API

**Requirements:** API-1 … API-4. Base path `/api`. All bodies are JSON. Words in responses are lowercase.

### 8.1 Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/games` | Start a new game |
| `GET` | `/api/games/:id` | Get the current state (used to recover after a page reload) |
| `POST` | `/api/games/:id/guesses` | Submit a guess |
| `GET` | `/api/games/:id/hint?top=10` | Remaining count + top suggestions |
| `GET` | `/api/health` | Liveness check |

### 8.2 Schemas

**POST /api/games** → `201`
```json
{ "id": "b1f2…", "status": "in_progress", "guesses": [], "maxGuesses": 6, "remaining": 2315 }
```
Optional request body `{ "answer": "crane" }` is accepted **only when** `ALLOW_FIXED_ANSWER=1` (for tests and demos). Otherwise it is ignored.

**POST /api/games/:id/guesses** body `{ "word": "crane" }` → `200`
```json
{
  "guess": { "word": "crane", "feedback": ["gray","green","gray","yellow","gray"] },
  "status": "in_progress",
  "guesses": [ … ],
  "remaining": 34,
  "answer": null
}
```
`answer` is filled in only when `status` is `won` or `lost`.

**GET /api/games/:id/hint** → `200`
```json
{
  "remaining": 34,
  "suggestions": [
    { "word": "dolts", "entropy": 4.213, "expectedRemaining": 2.9, "isCandidate": false },
    …
  ]
}
```
`top` is clamped to the range 1..50, with a default of 10. On a finished game the endpoint returns `409 GAME_OVER`.

### 8.3 Errors (API-4)
Every error uses the same shape:
```json
{ "error": { "code": "NOT_IN_WORD_LIST", "message": "\"xyzzy\" is not in the word list." } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `INVALID_BODY` | Missing/non-string `word`, malformed JSON |
| 400 | `INVALID_LENGTH` | Word is not 5 letters |
| 400 | `INVALID_CHARACTERS` | Non a–z characters |
| 422 | `NOT_IN_WORD_LIST` | Well-formed but not an allowed word |
| 404 | `GAME_NOT_FOUND` | Unknown game id |
| 409 | `GAME_OVER` | Guess or hint on a finished game |
| 500 | `INTERNAL` | Unexpected error; the message is generic and the details are logged on the server |

`GameError` codes from the core are mapped to HTTP statuses in one place (`server/errors.ts`). Route handlers never build error responses themselves.

### 8.4 Game store
- `Map<string, Game>` in memory. Ids come from `crypto.randomUUID()`.
- Games are evicted after 24 h of inactivity or once there are more than 10,000 games (LRU), so memory stays bounded. Restarting the server clears every game, which is acceptable under the non-goals.

---

## 9. Web page

**Requirements:** WEB-1 … WEB-4.

### 9.1 Layout
```
┌───────────────────────────────────────────────┐
│ Wordle Lab              [New game]            │
├───────────────────────────┬───────────────────┤
│   6 × 5 tile board        │  Words remaining  │
│                           │      34           │
│                           │  [Get hint]       │
│                           │  1. dolts 4.21 b  │
│                           │  2. …             │
├───────────────────────────┴───────────────────┤
│   on-screen keyboard (Q…P / A…L / ⏎ Z…M ⌫)    │
└───────────────────────────────────────────────┘
  Toast area for errors / win / loss messages
```
On narrow screens (< 700 px) the hint panel stacks below the board.

### 9.2 Behaviour
- **Board (WEB-1):** the current row shows typed letters. After the server responds, the tiles are coloured green (`#6aaa64`), yellow (`#c9b458`), or gray (`#787c7e`). Each tile also has a text/ARIA label (e.g. "C, correct position"), so colour is not the only signal.
- **Keyboard (WEB-1):** clickable keys plus physical keyboard input (letters, Enter, Backspace). Each key shows the best feedback seen for its letter, with priority green > yellow > gray.
- **Hint panel (WEB-2):** "Get hint" calls the hint endpoint and shows the top suggestions with entropy (2 dp), expected remaining, and a marker for "possible answer". Clicking a suggestion fills the current row.
- **Remaining counter (WEB-3):** set from `remaining` in the start-game and guess responses, so it updates after every guess without a separate hint call.
- **Error handling (WEB-4):**
  - API error responses show `error.message` in a short-lived toast and shake the current row. The board state stays as it was.
  - Network failures or non-JSON responses show "Can't reach the server. Try again." The input stays in place so the user can retry.
  - Input is disabled while a request is in flight, which prevents double submission.
  - A `404 GAME_NOT_FOUND` (for example after a server restart) offers a "Start new game" action.
- **End of game:** a toast shows the result and the answer. Input is disabled until the player starts a new game.
- **Reload:** the game id is kept in `sessionStorage`. On load, the page calls `GET /api/games/:id` to restore the board.

---

## 10. Testing strategy

Run all tests with `npm test`. Coverage target: ≥ 90 % lines in `src/core`.

### 10.1 Scoring (table-driven)
| guess | answer | expected | covers |
|---|---|---|---|
| crane | crane | GGGGG | win |
| fghij | crane | ----- (all gray) | no overlap |
| react | crane | YYGY- | yellows |
| speed | abide | --Y-Y | repeated letter in guess, one in answer |
| eerie | elder | GYY-- | three `e`s guessed, two in answer; green uses one first |
| allee | eagle | YY-YG | several repeats on both sides |
| llama | hello | YY--- | repeated `l`, where the answer also has two |

Key: G = green, Y = yellow, - = gray. These values were checked by hand and are also checked against a second, independent brute-force implementation inside the test file (property test: for 10,000 random pairs, `scoreGuess` == the reference implementation).

Further properties: `decode(encode(f)) == f`, and `scorePattern(w, w) === 242` for every answer.

### 10.2 Game
- A win sets the status, after which further guesses throw `GAME_OVER`.
- A loss after 6 guesses exposes the answer.
- Invalid words (wrong length, symbols, not in list) do not use up attempts.
- Input is normalised for case and whitespace.

### 10.3 Solver
- `filterCandidates` with an empty history returns every answer.
- After a guess, the true answer is **always** still a candidate (property test over random answer/guess sequences).
- Entropy of a guess that splits n candidates into n singleton buckets = `log2 n`. A guess that puts every candidate in one bucket = 0.
- Hand-computed example on a 4–6 word fixture list.
- Deterministic tie-break order.
- `n = 0` and `n = 1` edge cases.

### 10.4 API (supertest against `createApp(words)`)
- Happy path: start → guess → hint → win.
- Each error code in §8.3 is produced with the documented status and body shape.
- The hint's `remaining` equals `filterCandidates(...)`.length.

### 10.5 Web
- Manual checklist in the README: play a game, request a hint, enter an invalid word, try to guess after the game is over, stop the server mid-game.
- Optional: a Playwright smoke test (only if time allows).

---

## 11. Running locally

```bash
npm install
npm run dev        # API + web page on :3000 (Vite runs as Express middleware)
npm test
npm run build && npm start   # production: Express serves built web assets on :3000
```

Environment variables: `PORT` (3000), `ANSWERS_PATH`, `ALLOWED_PATH`, `ALLOW_FIXED_ANSWER` (unset).

---

## 12. Implementation plan

| # | Milestone | Deliverables | Done when |
|---|---|---|---|
| 1 | Scaffold | package.json, tsconfig, lint, Vitest, folder layout, word lists in `data/` | `npm test` runs (empty) |
| 2 | Scoring | `score.ts` + table tests and property tests | All scoring tests pass, including repeated-letter cases |
| 3 | Word list + Game | `wordlist.ts`, `game.ts` + tests | Game tests pass |
| 4 | Solver | `solver.ts` + tests; opening-move benchmark | Tests pass; opening rank < 1.5 s |
| 5 | API | Express app, store, error mapping + supertest suite | All §8.3 cases covered |
| 6 | Web UI | Board, keyboard, hint panel, counter, toasts | Manual checklist passes |
| 7 | README | Setup, design notes, AI-usage disclosure | Someone else can follow it from a fresh clone |

Build order follows dependencies: the core comes first and is fully tested before any web code is written.

---

## 13. AI usage and verification (GR-3)

The README will contain a section that lists, per module, whether it was written by hand, generated by AI, or AI-generated and then edited. Verification measures:
- Scoring is checked against an independent brute-force reference and against hand-worked cases with repeated letters.
- Entropy is checked against closed-form cases (`log2 n`, 0) and against a hand-computed small example.
- Solver soundness: a property test checks that the true answer is never filtered out.
- End-to-end: the best opening guess on the full lists is compared with the published value (`soare`, 5.886 bits).
- API behaviour: every documented error code has a test.

---

## 14. Requirement traceability

| ID | Requirement (from requirements.md) | Spec section | Tests |
|---|---|---|---|
| ENG-1 | Score guess green/yellow/gray | §5 | §10.1 |
| ENG-2 | Track game state, win/lose, allowed words | §6 | §10.2 |
| ENG-3 | Load word list from file | §4 | wordlist tests |
| SOL-1 | Compute remaining possible words | §7.1 | §10.3 |
| SOL-2 | Rank guesses by pattern entropy | §7.2 | §10.3 |
| SOL-3 | Return top suggestions with scores | §7.2, §8.2 | §10.3, §10.4 |
| API-1 | Start a game | §8 | §10.4 |
| API-2 | Submit guess → result + status | §8 | §10.4 |
| API-3 | Hint: remaining + suggestions with entropy | §8 | §10.4 |
| API-4 | Clear errors for invalid word / finished game | §8.3 | §10.4 |
| WEB-1 | Board with keyboard and coloured tiles | §9 | §10.5 |
| WEB-2 | Hint panel with suggestions, entropy, remaining | §9 | §10.5 |
| WEB-3 | Remaining counter updates each guess | §9 | §10.5 |
| WEB-4 | Graceful error handling | §9.2 | §10.5 |
| GR-1 | Runs locally, clear instructions | §11 | README |
| GR-2 | Game logic separate from web code | §3 | architecture test |
| GR-3 | Disclose AI-written parts and verification | §13 | README |
