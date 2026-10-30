# Wordle Lab

Play Wordle in the browser. A solver suggests the best next guess, ranked by expected information (entropy), and explains each suggestion.

- **Game engine:** scoring with correct handling of repeated letters, game state, and word lists loaded from files.
- **Solver:** works out the remaining candidates and ranks every allowed guess by the entropy of its feedback pattern.
- **HTTP API:** start a game, guess, get hints, all with clear JSON errors.
- **Web page:** board, on-screen and physical keyboard, hint panel, and a words-remaining counter.

Specs: [docs/requirements.md](docs/requirements.md) (the brief) and [docs/technical-requirement.md](docs/technical-requirement.md) (the design).

## Running it

Requires Node.js 22 or later.

```bash
pnpm install
pnpm run dev          # http://localhost:3000 (API + web page with hot reload)
```

Other commands:

```bash
pnpm test             # all tests (one of them ranks the full word lists and takes a few seconds)
pnpm run coverage     # coverage for src/core, skipping that slow full-list test
pnpm run typecheck
pnpm run build && npm start      # production build, served by Express on :3000
```

Settings come from environment variables or an optional `.env` file in the project root. Values set in the shell win over the file. To start one, run `cp .env.example .env`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port for the API and web page |
| `ANSWERS_PATH` / `ALLOWED_PATH` | `data/answers.txt` / `data/allowed.txt` | Word list files (relative to the project root) |
| `ALLOW_FIXED_ANSWER` | unset | `1` lets `POST /api/games` accept `{"answer": "..."}` for demos |
| `NODE_ENV` | `development` | `production` serves the built page; `npm start` sets it |

## Layout

```
data/            answers.txt (2,315 answers), allowed.txt (10,657 extra guesses)
src/core/        pure game + solver logic: no web code, usable from anywhere
src/server/      Express API: routes, error mapping, in-memory game store
src/web/         vanilla TypeScript page (Vite)
tests/           Vitest unit tests (core) and Supertest API tests
docs/            brief, technical spec, original PDF
```

The core never imports the server or the web code. `tests/core/architecture.test.ts` enforces this, so the same logic serves both the API and the tests.

## How the solver works

1. **Scoring.** Greens are marked first. Each remaining guess letter is yellow only while the answer still has unmatched copies of that letter, so `speed` vs `abide` gives `⬜⬜🟨⬜🟨`, with one yellow `e`, not two. Patterns are encoded as base-3 integers (0–242) for speed.
2. **Candidates.** An answer is still possible if it would have produced exactly the observed feedback for every past guess. This reuses the game's own scorer, so repeated letters need no special rules.
3. **Ranking.** For each allowed guess, the remaining candidates are grouped by the pattern they would produce, and the guess is scored by

   `H = −Σ p·log₂ p`. More bits means the colour pattern is expected to narrow the list more. Each suggestion also reports the expected number of words left (`Σ k² / n`) and whether it could be the answer. Ties go to possible answers, then alphabetical order.

4. The opening ranking (~13k guesses × 2,315 answers) takes about 0.7 s, so the server computes it once and caches it. Later turns take milliseconds. The best opener is `soare` at 5.886 bits.

## API

| Method | Path                                        | Success                                                                                 |
| ------ | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POST` | `/api/games`                                | `201` game state                                                                        |
| `GET`  | `/api/games/:id`                            | `200` game state                                                                        |
| `POST` | `/api/games/:id/guesses` `{"word":"crane"}` | `200` `{ guess, ...game state }`                                                        |
| `GET`  | `/api/games/:id/hint?top=10`                | `200` `{ remaining, suggestions: [{ word, entropy, expectedRemaining, isCandidate }] }` |
| `GET`  | `/api/health`                               | `200`                                                                                   |

Game state: `{ id, status: "in_progress"|"won"|"lost", guesses: [{ word, feedback }], maxGuesses, remaining, answer }`. `answer` is `null` until the game ends.

Errors always look like `{ "error": { "code", "message" } }`:

| Status | Code                                    | When                                                   |
| ------ | --------------------------------------- | ------------------------------------------------------ |
| 400    | `INVALID_BODY`                          | missing/non-string `word`, malformed JSON              |
| 400    | `INVALID_LENGTH` / `INVALID_CHARACTERS` | not five letters A–Z                                   |
| 422    | `NOT_IN_WORD_LIST`                      | well-formed but not an allowed word                    |
| 404    | `GAME_NOT_FOUND`                        | unknown or expired game id                             |
| 409    | `GAME_OVER`                             | guess or hint after the game ended                     |
| 500    | `INTERNAL`                              | unexpected error (details logged on the server only)   |

An invalid guess never uses up an attempt.

## Web page behaviour

The page uses a neon arcade theme with micro-interactions throughout. Everything is vanilla TypeScript in `src/web/`, with no UI framework.

- **Board:** letters pop in as you type, and a glowing cursor marks the next tile. Each guess flips tile by tile, and the keyboard keys pop into their colours once the row has landed. A winning row does a bounce. Yellow tiles use dark text for contrast, and every tile has an ARIA label, so colour is not the only signal.
- **Words-remaining meter:** the count animates down after every guess, with a floating "−N" badge. A progress bar fills as the possible words shrink, and its caption changes as you get closer. On narrow screens the count also appears in the "Guess 2 of 6" pill above the board.
- **The Solver:** a small robot thinks while you wait. Each suggestion shows its letters, its entropy in bits, a bar relative to the most information possible, and a *could win* or *scout* label. Clicking a suggestion pops it into the current row.
- **Result screen:** a win sprays a graffiti tag onto a brick wall (canvas, `src/web/graffiti.ts`), from "UNREAL!" for 1 guess to "CLUTCH!" for 6, with drips and paint splats. A loss sprays "SO CLOSE" and reveals the answer. Both show your stats and guess distribution, plus **Play again** (focused, so Enter starts the next game) and **Copy result** (an emoji grid).
- **Coming back:** a win streak with a flame in the header, a stats dialog, and a how-to-play guide on the first visit. Stats are kept in `localStorage`, and each game is counted only once even if you reload.
- **Errors** appear as a toast and shake the row, and the board is left unchanged. If the network fails, the typed word is kept. If the game has gone (for example after a server restart), the page offers **New game**. Input is locked while a request is in flight.
- The game id is kept in `sessionStorage`, so reloading the page restores the board.
- **Reduced motion:** if your system is set to reduce motion, animations are turned off and the graffiti is drawn already finished.

## Testing and verification

`pnpm test` runs 79 tests. `src/core` has 100% line coverage.

- **Scoring:** a hand-worked table of repeated-letter cases (`speed/abide`, `eerie/elder`, `allee/eagle`, `llama/hello`, `abbey/babes`, `sassy/mossy`…), plus 25,000 random pairs checked against an independently written reference scorer.
- **Entropy:** closed-form checks (a perfect split of n candidates gives log₂ n bits, a single bucket gives 0), a hand-computed uneven split (0.9183 bits, 5/3 words left), tie-break order, and the published best opener (`soare`, 5.886 bits).
- **Candidates:** a property test checks that the true answer is never filtered out, across 300 random games on the real lists.
- **API:** every error code in the table above has a test, along with the happy paths, the agreement of `remaining` with the solver, and a generic 500 that doesn't leak details.

Manual checklist for the web page: play to a win and to a loss, request hints mid-game, enter a short word and a non-word, stop the server mid-game and guess (you should see "Can't reach the server"), restart the server and guess (you should get the **New game** prompt), reload mid-game, and narrow the window below 700 px.

## Word lists

From the commonly used Wordle lists published by cfreshman:
[answers](https://gist.github.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b) and
[allowed guesses](https://gist.github.com/cfreshman/cdcdf777450c5b5301e439061d29694c). The loader validates every line (five letters a–z) and reports the file and line number of any bad entry.

## AI usage

Claude Code (an AI coding assistant) wrote the technical spec in `docs/technical-requirement.md`, the code and the tests, working from the brief. It was checked as follows:

- **Scoring** is checked against a second scorer written a different way, and against hand-worked cases.
- **Entropy** is checked against cases with known answers and against the published best-opener value.
- **Test expectations that were wrong** were found and corrected by reasoning about the case, not by loosening the code. One was a fixture game solvable in one guess. The other was a float-equality tie that the solver already handles with an epsilon.

_Fill in your own review notes here: which parts you read line by line, what you changed, and what you would do differently._
