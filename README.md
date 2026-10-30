# Wordle Lab

Wordle in the browser, with a solver that suggests the next guess ranked by entropy.

## Requirements

- Node.js 22+
- pnpm (`npm install -g pnpm`)

## Run

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Production

```bash
pnpm build
pnpm start
```

Serves the built app on http://localhost:3000.

## Test

```bash
pnpm test          # all tests
pnpm coverage      # coverage report (skips the slow full-list test)
pnpm typecheck
```

## Configuration

Optional. Copy `.env.example` to `.env` to override defaults. Shell variables take precedence.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `ANSWERS_PATH` | `data/answers.txt` | Answer word list |
| `ALLOWED_PATH` | `data/allowed.txt` | Allowed guesses list |
| `ALLOW_FIXED_ANSWER` | unset | `1` lets `POST /api/games` accept `{"answer": "..."}` |

## API

| Method | Path | Returns |
|---|---|---|
| `POST` | `/api/games` | New game |
| `GET` | `/api/games/:id` | Game state |
| `POST` | `/api/games/:id/guesses` | Body `{"word":"crane"}` → guess feedback + game state |
| `GET` | `/api/games/:id/hint?top=10` | Ranked suggestions |
| `GET` | `/api/health` | Health check |

Errors return `{ "error": { "code", "message" } }`.

## Project layout

```
data/        word lists
src/core/    game and solver logic
src/server/  Express API
src/web/     front end (Vite)
tests/       Vitest tests
```
