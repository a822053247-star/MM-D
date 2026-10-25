import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
export const MiB = 1024 * 1024;
export async function walk(root, prefix = '') {
  const items = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) items.push(...await walk(root, name + '/'));
    else items.push({ path: name, bytes: (await stat(join(root, name))).size });
  }
  return items.sort((a, b) => a.path.localeCompare(b.path));
}
export async function measure(root) {
  const config = JSON.parse(await readFile(join(root, 'game.json'), 'utf8'));
  const files = await walk(root), roots = config.subPackages.map(pack => pack.root);
  const packages = Object.fromEntries(roots.map(name => [name, files.filter(f => f.path.startsWith(name)).reduce((n, f) => n + f.bytes, 0)]));
  const mainBytes = files.filter(f => !roots.some(name => f.path.startsWith(name))).reduce((n, f) => n + f.bytes, 0);
  const firstPlayBytes = mainBytes + (packages['first-play/'] ?? 0);
  return { root: relative(process.cwd(), root), unit: 'MiB (1048576 bytes)', mainBytes, firstPlayBytes, packages, files,
    mainMiB: +(mainBytes / MiB).toFixed(3), firstPlayMiB: +(firstPlayBytes / MiB).toFixed(3),
    limits: { mainBytes: 3 * MiB, firstPlayBytes: 10 * MiB },
    passed: mainBytes <= 3 * MiB && firstPlayBytes <= 10 * MiB,
    note: 'Uncompressed local output, including configs and licenses. First-play includes main + first-play subpackage; not a network compression or IDE-reported size.' };
}
