import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export function createPreviewServer(root = 'test-results/web') {
  const directory = resolve(root);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      let path;
      if (url.pathname === '/') path = resolve('tests/preview.html');
      else if (url.pathname === '/mock-tt.js') path = resolve('tests/mock-tt.js');
      else if (url.pathname === '/native-worker.js') path = resolve('tests/native-worker.js');
      else {
        path = resolve(directory, '.' + decodeURIComponent(url.pathname));
        if (!path.startsWith(directory + sep)) throw new Error('Invalid path');
      }
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.ogg': 'audio/ogg', '.json': 'application/json' }[extname(path)] ?? 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); response.end(await readFile(path));
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createPreviewServer(); server.listen(5188, '127.0.0.1', () => console.log('Browser tt mock: http://127.0.0.1:5188 (not Douyin device verification)'));
}
