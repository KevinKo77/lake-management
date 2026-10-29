/** Local-only development server. No deployment, dependency or external service. */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const root = new URL('../', import.meta.url);
const allowed = /^\/(?:index\.html|src\/[a-z-]+\.(?:js|css)|data\/(?:tennis|manifest|investor-demo)\.json)$/;
const mime = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8'};
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export function createLocalServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', csp);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, {Allow: 'GET, HEAD'}); return response.end(); }
    try {
      let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (path === '/') path = '/index.html';
      if (!allowed.test(path)) { response.writeHead(404); return response.end('Not found'); }
      const file = await readFile(new URL(path.slice(1), root));
      response.writeHead(200, {'Content-Type': mime[path.split('.').at(-1)], 'Content-Length': file.length});
      response.end(request.method === 'HEAD' ? undefined : file);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 400);
      response.end('Resource unavailable');
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.LAKE_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('LAKE_PORT must be an integer from 1024 to 65535');
  const server = createLocalServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Lake Intelligence local terminal: http://127.0.0.1:${port}`));
}
