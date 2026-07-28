import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildTutorError } from '../api/solidworks-tutor.js';

test('CAD API: structured upstream errors have a stable client contract', () => {
  assert.deepEqual(
    buildTutorError(
      'TUTOR_UPSTREAM_ERROR',
      'Tutor service had a hiccup. Try again.'
    ),
    {
      ok: false,
      code: 'TUTOR_UPSTREAM_ERROR',
      message: 'Tutor service had a hiccup. Try again.',
    }
  );
});

test('CAD client: non-OK responses are not all labeled as fair-use limits', () => {
  const html = fs.readFileSync(
    new URL('../solidworks-tutor.html', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(
    html,
    /if\s*\(\s*!r\.ok\s*\|\|\s*d\.code\s*===\s*["']FAIR_USE_LIMIT["']\s*\)/
  );
  assert.match(html, /if\s*\(\s*!r\.ok\s*\)\s*\{/);
  assert.match(
    html,
    /if\s*\(\s*d\.code\s*===\s*["']FAIR_USE_LIMIT["']\s*\)/
  );
  assert.match(
    html,
    /d\.message\s*\|\|\s*d\.error\s*\|\|\s*"Tutor request failed/
  );
});
