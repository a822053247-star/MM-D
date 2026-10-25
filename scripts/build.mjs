import { build } from 'vite';
import { mkdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { measure } from './size-lib.mjs';
import { threeDouyin } from './three-douyin.mjs';
import { EFFECT_ATLASES } from '../src/content/effect-recipes.ts';
import { RELEASE_EFFECT_ATLASES } from '../src/content/enabled.ts';
import { createHash } from 'node:crypto';

const testing = process.argv.includes('--test');
const output = testing ? 'test-results/web' : 'dist';
const vfxBudget = JSON.parse(await readFile('config/vfx-budget.json', 'utf8'));
for (const id of RELEASE_EFFECT_ATLASES) {
  const atlas = EFFECT_ATLASES[id];
  const bytes = await readFile(atlas.source);
  if (bytes.length > vfxBudget.maxAtlasBytes || createHash('sha256').update(bytes).digest('hex') !== atlas.sha256) {
    throw new Error(`Prepared VFX exceeds budget or differs from manifest: ${atlas.source}`);
  }
}
await build({
  configFile: false, publicDir: false, mode: 'production',
  plugins: [threeDouyin()],
  define: { __MM_TEST__: JSON.stringify(testing), 'import.meta.env.BASE_URL': JSON.stringify('./') },
  build: {
    outDir: output, emptyOutDir: true, target: 'es2020', sourcemap: false, minify: true,
    lib: { entry: resolve('src/main.ts'), name: 'MonsterBonkDouyin', formats: ['iife'], fileName: () => 'game.js' },
  },
});
await mkdir(`${output}/first-play`, { recursive: true });
// Effects only ship through the enabled-content dependency list, including flame.
await cp('resources/first-play', `${output}/first-play`, { recursive: true,
  filter: source => resolve(source) !== resolve('resources/first-play/vfx') });
await mkdir(`${output}/first-play/vfx`, { recursive: true });
for (const id of RELEASE_EFFECT_ATLASES) {
  const effect = EFFECT_ATLASES[id];
  await copyFile(effect.source, `${output}/first-play/${effect.url}`);
}
await writeFile(`${output}/first-play/game.js`, '// First-play resources loaded by tt.loadSubpackage.\n');
await copyFile('config/game.json', `${output}/game.json`);
const project = JSON.parse(await readFile('config/project.config.json', 'utf8'));
project.appid = process.env.DOUYIN_APP_ID ?? project.appid;
await writeFile(`${output}/project.config.json`, JSON.stringify(project, null, 2));
await copyFile('THIRD_PARTY_LICENSES.txt', `${output}/THIRD_PARTY_LICENSES.txt`);
for (const id of RELEASE_EFFECT_ATLASES) {
  const effect = EFFECT_ATLASES[id];
  const bytes = await readFile(`${output}/first-play/${effect.url}`);
  if (bytes.length > vfxBudget.maxAtlasBytes) throw new Error(`VFX exceeds per-atlas budget: ${effect.url}`);
  if (createHash('sha256').update(bytes).digest('hex') !== effect.sha256) throw new Error(`VFX manifest does not match resource: ${effect.url}`);
}
const report = await measure(output);
await mkdir('docs', { recursive: true });
await writeFile(testing ? 'test-results/size-test.json' : 'docs/size-report.json', JSON.stringify(report, null, 2));
console.log(`Main: ${report.mainMiB} MiB; first play (main + resources): ${report.firstPlayMiB} MiB`);
if (!report.passed) throw new Error('Build exceeds size budget');
const code = await readFile(`${output}/game.js`, 'utf8');
// The production entry must remain standalone, without browser APIs or runtime imports.
for (const pattern of [/\bdocument\s*\./, /\bwindow\s*\./, /\bnavigator\s*\./, /\bfetch\s*\(/, /\bnew\s+Worker\s*\(/, /\bimport\s*\(/]) {
  if (pattern.test(code)) throw new Error(`Browser-only API or runtime import in game.js: ${pattern}`);
}
if (!testing && code.includes('__MM_DOUYIN_TEST__')) throw new Error('Test controls leaked into production');
