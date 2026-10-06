import { describe, expect, it } from 'vitest';
import { dark, light, type ColorScheme } from '@crm/tokens';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs with css: false, so read the file directly (cwd = apps/web).
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('\n}', start));
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();

function expectMirrors(selector: string, scheme: ColorScheme) {
  const body = block(selector);
  for (const [key, value] of Object.entries(scheme)) {
    const m = new RegExp(`--${kebab(key)}:\\s*([^;]+);`).exec(body);
    expect(m, `--${kebab(key)} missing in ${selector}`).not.toBeNull();
    expect(norm(m![1]!), `--${kebab(key)} in ${selector}`).toBe(norm(value));
  }
}

describe('styles.css mirrors @crm/tokens', () => {
  it('light theme (:root)', () => expectMirrors(':root', light));
  it('dark theme (.dark)', () => expectMirrors('.dark', dark));
});
