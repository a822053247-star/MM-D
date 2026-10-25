import { measure } from './size-lib.mjs';
const result = await measure(process.argv[2] ?? 'dist');
console.log(`Main ${result.mainMiB} / 3 MiB; first play ${result.firstPlayMiB} / 10 MiB`);
if (!result.passed) throw new Error('Size budget exceeded');
