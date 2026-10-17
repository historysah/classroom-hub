const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');

const root = path.join(__dirname, 'dist');
const dataDirectory = path.join(__dirname, 'data');
const databaseFile = path.join(dataDirectory, 'diary.sqlite');
const files = {
  '/':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js',
  '/tools/catalog.js':'tools/catalog.js','/tools/timer.js':'tools/timer.js',
  '/tools/pdf-counter.js':'tools/pdf-counter.js','/tools/text-count.js':'tools/text-count.js',
  '/tools/embedded-pdf-data.js':'tools/embedded-pdf-data.js','/tools/qr-maker.js':'tools/qr-maker.js',
  '/tools/diary.js':'tools/diary.js','/tools/diary-folder-store.js':'tools/diary-folder-store.js','/vendor/qrcode/qrcode.js':'vendor/qrcode/qrcode.js',
  '/vendor/sqljs/sql-asm.js':'vendor/sqljs/sql-asm.js',
  '/vendor/pdfjs/pdf.classic.js':'vendor/pdfjs/pdf.classic.js',
  '/vendor/pdfjs/pdf.worker.classic.js':'vendor/pdfjs/pdf.worker.classic.js',
  '/vendor/pdfjs/binary-data.js':'vendor/pdfjs/binary-data.js',
  '/tools/privacy-core.js':'tools/privacy-core.js',
  '/tools/privacy-xlsx.js':'tools/privacy-xlsx.js',
  '/tools/privacy-pdf.js':'tools/privacy-pdf.js',
  '/tools/privacy-tool.js':'tools/privacy-tool.js',
  '/vendor/jszip/jszip.min.js':'vendor/jszip/jszip.min.js',
  '/vendor/xml-js/xml-js.min.js':'vendor/xml-js/xml-js.min.js',
  '/vendor/pdf-lib/pdf-lib.min.js':'vendor/pdf-lib/pdf-lib.min.js'
};
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.ttf':'font/ttf','.otf':'font/otf'};

function openDiaryDatabase(filename = databaseFile) {
  fs.mkdirSync(path.dirname(filename), {recursive:true});
  const db = new DatabaseSync(filename);
  db.exec(`CREATE TABLE IF NOT EXISTS diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  return db;
}

function cleanEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const entryDate = typeof value.entryDate === 'string' ? value.entryDate.trim() : '';
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const body = typeof value.body === 'string' ? value.body.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return null;
  const date = new Date(`${entryDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entryDate) return null;
  if (!title || title.length > 120 || !body || body.length > 20000) return null;
  return {entryDate, title, body};
}

function createAppServer(db) {
  const list = db.prepare('SELECT id, entry_date AS entryDate, title, body, created_at AS createdAt, updated_at AS updatedAt FROM diary_entries ORDER BY entry_date DESC, id DESC');
  const one = db.prepare('SELECT id, entry_date AS entryDate, title, body, created_at AS createdAt, updated_at AS updatedAt FROM diary_entries WHERE id = ?');
  const insert = db.prepare('INSERT INTO diary_entries (entry_date, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  const update = db.prepare('UPDATE diary_entries SET entry_date = ?, title = ?, body = ?, updated_at = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM diary_entries WHERE id = ?');

  function json(res, status, value) {
    res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(value));
  }

  async function readJson(req) {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('JSON 요청이 필요합니다.'), {status:415});
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 100000) throw Object.assign(new Error('일기 내용이 너무 깁니다.'), {status:413});
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('요청 내용을 읽을 수 없습니다.'), {status:400}); }
  }

  return http.createServer(async (req, res) => {
    try {
      const address = req.socket.address();
      const expectedHost = `127.0.0.1:${address.port}`;
      if (req.headers.host !== expectedHost) return json(res, 403, {error:'이 컴퓨터에서만 열 수 있습니다.'});
      const pathname = new URL(req.url, `http://${expectedHost}`).pathname;

      if (pathname === '/api/health') {
        if (req.method !== 'GET') return json(res, 405, {error:'지원하지 않는 요청입니다.'});
        return json(res, 200, {app:'classroom-hub', ready:true});
      }

      if (pathname === '/api/diary' || /^\/api\/diary\/\d+$/.test(pathname)) {
        const origin = `http://${expectedHost}`;
        if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, {error:'허용되지 않은 요청입니다.'});
        if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, {error:'허용되지 않은 요청입니다.'});
        if (!['GET','POST','PUT','DELETE'].includes(req.method)) return json(res, 405, {error:'지원하지 않는 요청입니다.'});
        if (req.method !== 'GET' && req.headers.origin !== origin) return json(res, 403, {error:'허용되지 않은 요청입니다.'});
        const match = pathname.match(/^\/api\/diary\/(\d+)$/);
        const id = match ? Number(match[1]) : null;
        if (match && (!Number.isSafeInteger(id) || id < 1)) return json(res, 400, {error:'잘못된 일기 번호입니다.'});

        if (req.method === 'GET' && !match) return json(res, 200, {entries:list.all()});
        if (req.method === 'GET' && match) {
          const entry = one.get(id);
          return entry ? json(res, 200, {entry}) : json(res, 404, {error:'일기를 찾을 수 없습니다.'});
        }
        if (req.method === 'DELETE' && match) {
          return remove.run(id).changes ? json(res, 200, {deleted:true}) : json(res, 404, {error:'일기를 찾을 수 없습니다.'});
        }
        if ((req.method === 'POST' && !match) || (req.method === 'PUT' && match)) {
          const entry = cleanEntry(await readJson(req));
          if (!entry) return json(res, 400, {error:'날짜, 제목, 내용을 확인해 주세요.'});
          const now = new Date().toISOString();
          if (req.method === 'POST') {
            const result = insert.run(entry.entryDate, entry.title, entry.body, now, now);
            return json(res, 201, {entry:one.get(result.lastInsertRowid)});
          }
          return update.run(entry.entryDate, entry.title, entry.body, now, id).changes
            ? json(res, 200, {entry:one.get(id)}) : json(res, 404, {error:'일기를 찾을 수 없습니다.'});
        }
        return json(res, 405, {error:'지원하지 않는 요청입니다.'});
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, {'Allow':'GET, HEAD'}); return res.end('Method not allowed');
      }
      const vendorAsset = /^\/vendor\/pdfjs\/(cmaps|standard_fonts)\/[A-Za-z0-9_.-]+$/.test(pathname) ? pathname.slice(1) : null;
      const file = files[pathname] || vendorAsset;
      if (!file) { res.writeHead(404); return res.end('Not found'); }
      fs.readFile(path.join(root, file), (error, data) => {
        if (error) { res.writeHead(500); return res.end('Unable to read file'); }
        res.writeHead(200, {'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end(req.method === 'HEAD' ? undefined : data);
      });
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, {error:error.status ? error.message : '저장 중 오류가 발생했습니다.'});
    }
  });
}

function openSite(route = 'home') {
  const url = `http://127.0.0.1:4174/#${route === 'diary' ? 'diary' : 'home'}`;
  require('node:child_process').exec(`start "" "${url}"`, {windowsHide:true}, error => {
    if (error) console.error(`브라우저가 자동으로 열리지 않았습니다. 직접 열기: ${url}`);
  });
}

function probeHub(pathname, matches) {
  return new Promise(resolve => {
    const request = http.get(`http://127.0.0.1:4174${pathname}`, {timeout:1200}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try {resolve(response.statusCode === 200 && matches(Buffer.concat(chunks).toString()));}
        catch {resolve(false);}
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

async function checkRunningHub() {
  if (await probeHub('/api/health', body => JSON.parse(body).app === 'classroom-hub')) return true;
  return probeHub('/index.html', body => body.includes('<title>교실 도구함'));
}

async function startHub({open = false, route = 'home'} = {}) {
  if (await checkRunningHub()) {
    if (open) openSite(route);
    console.log('실행 중인 교실 도구함을 열었습니다.');
    return null;
  }
  const db = openDiaryDatabase();
  const server = createAppServer(db);
  try {
    await new Promise((resolve, reject) => {
      const onError = error => reject(error);
      server.once('error', onError);
      server.listen(4174, '127.0.0.1', () => {server.off('error', onError); resolve();});
    });
  } catch (error) {
    db.close();
    if (error.code === 'EADDRINUSE' && await checkRunningHub()) {
      if (open) openSite(route);
      return null;
    }
    throw error;
  }
  console.log('교실 도구함: http://127.0.0.1:4174/#home');
  console.log(`일기 데이터: ${databaseFile}`);
  console.log('이 창을 열어두면 일기장을 사용할 수 있습니다.');
  if (open) openSite(route);
  process.on('SIGINT', () => {server.close(); db.close();});
  return server;
}

if (require.main === module) {
  startHub({open:process.argv.includes('--open'), route:process.argv.includes('--diary') ? 'diary' : 'home'})
    .catch(error => {console.error(error); process.exitCode = 1;});
}

module.exports = {openDiaryDatabase, cleanEntry, createAppServer, databaseFile, checkRunningHub, startHub};
