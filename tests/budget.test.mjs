import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, MiB } from '../scripts/size-lib.mjs';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('real production main and first download satisfy budgets; no source packs ship', async () => {
  const report = await measure('dist');
  assert.ok(report.mainBytes < 3 * MiB); assert.ok(report.firstPlayBytes <= 10 * MiB);
  assert.ok(report.firstPlayBytes >= 5 * MiB);
  assert.deepEqual(Object.keys(report.packages), ['first-play/']);
  assert.equal(report.files.some(f => /\.(wav|glb|map|ts|unitypackage)$/.test(f.path)), false);
  const code = await readFile('dist/game.js', 'utf8');
  assert.equal(/\b(?:document|window|navigator)\s*\.|\bfetch\s*\(|__MM_DOUYIN_TEST__/.test(code), false);
});

test('all declared first-play images and music match the source snapshot', async () => {
  const { resources } = JSON.parse(await readFile('docs/source-snapshot.json', 'utf8'));
  for (const resource of resources) {
    const bytes = await readFile(`dist/first-play/${resource.name}`);
    assert.equal(bytes.length, resource.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), resource.sha256);
  }
  assert.equal(resources.length, 11);
});
