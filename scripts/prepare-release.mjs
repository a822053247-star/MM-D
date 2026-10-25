import { readFile } from 'node:fs/promises';
import { measure } from './size-lib.mjs';
const project = JSON.parse(await readFile('dist/project.config.json', 'utf8'));
if (!/^tt[0-9a-z]+$/i.test(project.appid)) throw new Error('Set a real DOUYIN_APP_ID, then run npm run build before preparing release');
const report = await measure('dist');
if (!report.passed) throw new Error('Size budget exceeded');
console.log('Local release preparation passed. Use Douyin DevTools to verify package size and test real devices before upload.');
