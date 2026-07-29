import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Resume preview uses a light paper surface with dark text', () => {
  const html = fs.readFileSync(
    new URL('../resume.html', import.meta.url),
    'utf8'
  );

  const paperRule = html.match(/\.paper\s*\{([^}]*)\}/);
  assert.ok(paperRule, 'Expected a .paper CSS rule');
  assert.match(paperRule[1], /background\s*:\s*#(?:fff|ffffff)\b/i);
  assert.match(paperRule[1], /color\s*:\s*#111\b/i);
  assert.doesNotMatch(paperRule[1], /background\s*:\s*var\(--surface\)/i);
});
