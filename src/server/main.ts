import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { loadWordList } from '../core';
import { createApp } from './app';

const root = resolve(import.meta.dirname, '../..');

// Optional local settings; variables already set in the shell win over the file.
const envFile = resolve(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';

const words = loadWordList(
  resolve(root, process.env.ANSWERS_PATH || 'data/answers.txt'),
  resolve(root, process.env.ALLOWED_PATH || 'data/allowed.txt'),
);
console.log(`Loaded ${words.answers.length} answers and ${words.guessPool.length} allowed guesses.`);

const app = createApp({ words, allowFixedAnswer: process.env.ALLOW_FIXED_ANSWER === '1' });

if (production) {
  const webDir = resolve(root, 'dist/web');
  if (!existsSync(webDir)) {
    console.error('dist/web is missing. Run `npm run build` first.');
    process.exit(1);
  }
  app.use(express.static(webDir));
} else {
  // Dev: Vite serves the web app from the same port, with hot reload.
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: resolve(root, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

// Express 5 calls this callback with an error if listening fails.
app.listen(port, (err?: NodeJS.ErrnoException) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use by another program. Try: PORT=${port + 1} npm run dev`);
    process.exit(1);
  }
  if (err) throw err;
  console.log(`Wordle Lab running at http://localhost:${port}`);
});
