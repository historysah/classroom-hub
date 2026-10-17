const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Readable} = require('node:stream');
const {openDiaryDatabase, cleanEntry, createAppServer} = require('./server.cjs');

(async () => {
  assert.equal(cleanEntry({entryDate:'2026-02-30',title:'제목',body:'내용'}), null);
  assert.equal(cleanEntry({entryDate:'2026-10-17',title:'제목',body:'내용'}).title, '제목');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'classroom-diary-test-'));
  const filename = path.join(directory, 'diary.sqlite');
  const db = openDiaryDatabase(filename);
  const server = createAppServer(db);
  const base = 'http://127.0.0.1:4174';
  function request(method, url, payload, origin = base, extraHeaders = {}) {
    return new Promise(resolve => {
      const req = Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]);
      req.method = method;
      req.url = url;
      req.socket = {address: () => ({port:4174})};
      req.headers = {host:'127.0.0.1:4174', origin, 'content-type':'application/json', ...extraHeaders};
      const res = {
        headersSent:false,
        writeHead(status) {this.status = status; this.headersSent = true;},
        end(body = '') {resolve({status:this.status, body:body ? JSON.parse(body) : null});}
      };
      server.emit('request', req, res);
    });
  }
  try {
    const payload = {entryDate:'2026-10-17',title:'첫 기록',body:'오늘의 일기'};
    const health = await request('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.app, 'classroom-hub');
    assert.match(fs.readFileSync(path.join(__dirname, '교실도구함 열기.cmd'), 'utf8'), /server\.cjs" --open/);
    assert.match(fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8'), /교실도구함 열기\.cmd/);
    const created = await request('POST', '/api/diary', payload);
    assert.equal(created.status, 201);
    const id = created.body.entry.id;
    const secondConnection = openDiaryDatabase(filename);
    assert.equal(secondConnection.prepare('SELECT title FROM diary_entries WHERE id = ?').get(id).title, '첫 기록');
    secondConnection.close();
    assert.equal((await request('GET', '/api/diary')).body.entries.length, 1);
    assert.equal((await request('PUT', `/api/diary/${id}`, {...payload,title:'수정한 기록'})).status, 200);
    assert.equal((await request('GET', `/api/diary/${id}`)).body.entry.title, '수정한 기록');
    assert.equal((await request('POST', '/api/diary', payload, 'http://other.example')).status, 403);
    assert.equal((await request('GET', '/api/diary', undefined, undefined, {'sec-fetch-site':'cross-site', origin:undefined})).status, 403);
    assert.equal((await request('DELETE', `/api/diary/${id}`)).status, 200);
    assert.equal((await request('GET', '/api/diary')).body.entries.length, 0);
    function staticRequest(url) {
      return new Promise(resolve => {
        const req = {method:'GET',url,socket:{address:() => ({port:4174})},headers:{host:'127.0.0.1:4174'}};
        const res = {writeHead(status) {this.status = status;},end(body = '') {resolve({status:this.status,body:String(body)});}};
        server.emit('request', req, res);
      });
    }
    const home = await staticRequest('/index.html');
    assert.equal(home.status, 200);
    assert.match(home.body, /id="diary-app"/);
    assert.equal((await staticRequest('/tools/diary.js')).status, 200);
    assert.equal((await staticRequest('/tools/diary-folder-store.js')).status, 200);
    assert.equal((await staticRequest('/vendor/sqljs/sql-asm.js')).status, 200);
    assert.equal((await staticRequest('/data/diary.sqlite')).status, 404);
    let fileBytes = new Uint8Array(fs.readFileSync(filename));
    const fileHandle = {
      async getFile() {return {size:fileBytes.length, arrayBuffer:async () => fileBytes.slice().buffer};},
      async createWritable() {
        let next;
        return {async write(data) {next = new Uint8Array(data);}, async close() {fileBytes = next;}, async abort() {next = null;}};
      }
    };
    const directoryHandle = {async getFileHandle(name) {assert.equal(name, 'diary.sqlite'); return fileHandle;}};
    const initSqlJs = require('./dist/vendor/sqljs/sql-asm.js');
    const folderApi = require('./dist/tools/diary-folder-store.js');
    const browserDiary = await folderApi.open(directoryHandle, {initSqlJs});
    const browserEntry = await browserDiary.create({entryDate:'2026-10-17',title:'브라우저 기록',body:'폴더에 저장'});
    assert.equal(browserDiary.list()[0].title, '브라우저 기록');
    await browserDiary.update(browserEntry.id, {entryDate:'2026-10-17',title:'수정된 기록',body:'폴더에 저장'});
    browserDiary.close();
    const reopened = await folderApi.open(directoryHandle, {initSqlJs});
    assert.equal(reopened.list()[0].title, '수정된 기록');
    await reopened.remove(browserEntry.id);
    assert.equal(reopened.list().length, 0);
    reopened.close();
    process.stdout.write('일기장 저장·조회·수정·삭제와 외부 출처 차단 확인 완료\n');
  } finally {
    db.close();
    fs.unlinkSync(filename);
    fs.rmdirSync(directory);
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
