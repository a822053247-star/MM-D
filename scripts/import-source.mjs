import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Explicit, one-time snapshot. Builds never read the original project.
const source = resolve(process.argv[2] ?? '../../MonsterBonk Mobile');
const pending = ['combat.ts', 'creature-animation.ts', 'enemy-directions.ts'];
const files = new Map();
while (pending.length) {
  const name = pending.pop();
  if (files.has(name)) continue;
  const full = resolve(source, 'src', name);
  const text = await readFile(full, 'utf8');
  files.set(name, createHash('sha256').update(text).digest('hex'));
  const target = resolve('src/core', name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
  for (const match of text.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      const next = relative(resolve(source, 'src'), resolve(dirname(full), match[1])).replaceAll('\\', '/');
      if (!/\.(css|png|svg)$/.test(next)) pending.push(next.endsWith('.ts') ? next : `${next}.ts`);
  }
}
const assets = [
  ['hero-walk.png', 'assets/pixel/creatures/animation/yanrong-animation-sheet.normalized.png'],
  ['hero-diagonal.png', 'assets/pixel/creatures/animation/yanrong-diagonal-walk.normalized.png'],
  ['enemy-normal.png', 'assets/pixel/enemies/direction/grass-monster-directions/runtime.normalized.png'],
  ['enemy-fast.png', 'assets/pixel/enemies/direction/runner-bug-directions/runtime.normalized.png'],
  ['enemy-tank.png', 'assets/pixel/enemies/direction/rock-armor-bug-directions/runtime.normalized.png'],
  ['menu.png', 'assets/ui/menu/forest-yanrong-background.png'],
  ['grassland.ogg', 'assets/music/bgm-grassland.ogg'],
];
await mkdir('resources/first-play', { recursive: true });
const resources = [];
for (const [name, original] of assets) {
  const bytes = await readFile(resolve(source, 'public', original));
  await copyFile(resolve(source, 'public', original), resolve('resources/first-play', name));
  resources.push({ name, original, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await mkdir('docs', { recursive: true });
await writeFile('docs/source-snapshot.json', JSON.stringify({ source, date: '2026-10-25', files: Object.fromEntries(files), resources }, null, 2));
console.log(`Snapshot: ${files.size} source files, ${resources.length} first-play assets`);
