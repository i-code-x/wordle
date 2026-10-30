# Wordle Lab: Requirements

## The task

Build a small web app where a user can play Wordle, and where a solver can suggest the best next guess and explain why.

Use any language, framework, or tools you like, including AI assistants. Clarity and correctness matter more than polish.

## What to build

### 1. Game engine

- Score a guess against an answer (green / yellow / gray).
- Track game state: guesses so far, win or lose, and whether a word is allowed.
- Load the word list from a file.

### 2. Solver

- Given the guesses and results so far, work out which words are still possible.
- Rank possible next guesses by expected information (the entropy of the result pattern across the remaining words).
- Return the top suggestions with their scores.

### 3. HTTP API

- Start a game.
- Submit a guess and get back the result and game status.
- Request a hint: the number of remaining words and the top suggestions with their entropy.
- Return clear error messages for invalid words or a finished game.

### 4. Web page

- A playable board with a keyboard and colored tiles.
- A hint panel showing suggestions, their entropy, and how many words remain.
- A "words remaining" counter that updates after each guess.
- Graceful handling of errors, without breaking the page.

## Optional stretch

Add a "simulate" feature that runs the solver against every answer in the list and shows how many guesses it needed. Only attempt this if there is time left.

## Ground rules

- No login, database, or deployment is needed. A project that runs locally with clear instructions is the finish line.
- Keep the game logic separate from the web code, so the same logic works whichever way it is used.
- Be ready to explain which parts an AI tool wrote and how they were checked.

## Deliverables

A link to a repository or a zip file containing:

- The code
- Tests
- A README with instructions to run the project
