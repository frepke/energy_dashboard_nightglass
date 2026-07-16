import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'styles/insights.css'), 'utf8');
const normalizedCss = css.replace(/\s+/g, ' ').trim();

describe('smart insight light theme readability styles', () => {
  it('defines explicit light-theme text contrast for Smart Insight copy', () => {
    expect(normalizedCss).toContain('[data-theme="light"] .smart-insight-text { color: rgba(10,21,53,.96); }');
    expect(normalizedCss).toContain('[data-theme="light"] .smart-insight-context { color: rgba(18,40,92,.80); }');
    expect(normalizedCss).toContain('[data-theme="light"] .smart-insight-title { color: rgba(22,47,102,.74); }');
  });
});
