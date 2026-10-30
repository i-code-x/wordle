import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const coreDir = resolve(import.meta.dirname, '../../src/core');

describe('core library boundaries', () => {
  it('core imports nothing from the server, the web app, or web frameworks', () => {
    for (const file of readdirSync(coreDir)) {
      const source = readFileSync(resolve(coreDir, file), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!);
      for (const spec of imports) {
        const ok = spec.startsWith('./') || spec === 'node:fs';
        expect(ok, `${file} imports "${spec}"`).toBe(true);
      }
    }
  });

  it('only the word list loader touches the file system', () => {
    for (const file of readdirSync(coreDir)) {
      const source = readFileSync(resolve(coreDir, file), 'utf8');
      if (file !== 'wordlist.ts') expect(source, file).not.toContain('node:');
    }
  });
});
