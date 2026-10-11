// Explicit browser QA fixture. No AI, document parsing or production backend calls.
// Build first; then run node tests/mock-preview.mjs and visit localhost:5175.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(import.meta.dirname, '../dist');
const fixtures = resolve(import.meta.dirname, '.fixtures');
await mkdir(fixtures, { recursive: true });
await writeFile(resolve(fixtures, 'qa-resume.doc'), 'SIMULATED TEST DOCUMENT. No personal data.');
await writeFile(resolve(fixtures, 'qa-photo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=', 'base64'));
const tasks = new Map();
let sequence = 0;
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost:5175').pathname;
  if (pathname === '/api/backgrounds' && req.method === 'POST') {
    for await (const chunk of req) { /* Consume fixture multipart, never parse personal documents. */ }
    return json(res, 200, { background_id: 'SIMULATED-background', ready_for_generation: true, warnings: ['qa-resume.doc \u5df2\u63d0\u53d6\u6587\u5b57；\u591a\u680f\u987a\u5e8f\u53ef\u80fd\u53d8\u5316，\u539f\u6587\u4ef6\u5df2\u4fdd\u7559\u4f9b\u6838\u5bf9。'] });
  }
  if (pathname === '/api/generations' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body), id = `SIMULATED-task-${++sequence}`;
    tasks.set(id, { started: Date.now(), fail: input.company.toLowerCase().includes('fail') });
    return json(res, 200, { id, status: 'queued' });
  }
  if (pathname.startsWith('/api/generations/')) {
    const id = pathname.split('/')[3], task = tasks.get(id);
    if (!task) return json(res, 404, { detail: 'SIMULATED task unavailable' });
    if (pathname.includes('/files/')) {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="SIMULATED-document.txt"' });
      return res.end('SIMULATED download fixture; no generated application.');
    }
    const elapsed = (Date.now() - task.started) / 1000;
    const status = elapsed < 4 ? 'queued' : elapsed < 24 ? 'running' : task.fail ? 'failed' : 'succeeded';
    const stage = elapsed < 4 ? 'queued' : elapsed < 8 ? 'preparing' : elapsed < 18 ? 'generating' : elapsed < 24 ? 'validating' : task.fail ? 'failed' : 'completed';
    const files = Object.fromEntries(['professional_resume', 'ats_resume', 'professional_cover_letter'].map(kind => [kind, { name: `${kind}.docx`, url: `/api/generations/${id}/files/${kind}` }]));
    return json(res, 200, { id, status, stage, error: status === 'failed' ? '\u4efb\u52a1\u8d85\u65f6，\u5df2\u7ec8\u6b62\u751f\u6210\u8fdb\u7a0b。' : null, ...(status === 'succeeded' ? { files, warnings: ['SIMULATED generation warning'] } : {}) });
  }
  const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!path.startsWith(root + sep)) return json(res, 403, {});
  try {
    let data = await readFile(path);
    if (pathname === '/api.js') data = Buffer.from(data.toString().replace('http://127.0.0.1:8000', 'http://localhost:5175'));
    if (extname(path) === '.html') data = Buffer.from(data.toString().replace('</body>', '<div style="position:fixed;top:0;left:0;right:0;z-index:1000;background:#fff0ad;color:#563e11;text-align:center;font:11px Arial;padding:3px;pointer-events:none">SIMULATED BACKEND · No real document parsing or AI generation</div></body>'));
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { json(res, 404, { detail: 'Build first with npm run build' }); }
}).listen(5175, '127.0.0.1', () => console.log('SIMULATED QA only: http://localhost:5175 · production API unchanged'));
