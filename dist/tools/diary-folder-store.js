(() => {
  'use strict';

  const columns = 'id, entry_date AS entryDate, title, body, created_at AS createdAt, updated_at AS updatedAt';
  const schema = `CREATE TABLE IF NOT EXISTS diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_date TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`;

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

  function rows(database, sql, params = []) {
    const statement = database.prepare(sql);
    try {
      statement.bind(params);
      const result = [];
      while (statement.step()) result.push(statement.getAsObject());
      return result;
    } finally { statement.free(); }
  }

  async function open(directoryHandle, options = {}) {
    const init = options.initSqlJs || globalThis.initSqlJs;
    if (!init) throw new Error('일기 데이터베이스 코드를 불러오지 못했습니다.');
    const SQL = await init();
    const fileHandle = await directoryHandle.getFileHandle('diary.sqlite', {create:true});
    const existing = await fileHandle.getFile();
    let database = existing.size
      ? new SQL.Database(new Uint8Array(await existing.arrayBuffer()))
      : new SQL.Database();
    database.run(schema);
    let saving = false;
    let fileSize = existing.size;
    let fileModified = existing.lastModified;

    function list() {
      return rows(database, `SELECT ${columns} FROM diary_entries ORDER BY entry_date DESC, id DESC`);
    }

    async function commit(operation) {
      if (saving) throw new Error('저장 중입니다. 잠시 뒤 다시 시도해 주세요.');
      saving = true;
      let copy;
      let writable;
      try {
        const current = await fileHandle.getFile();
        if (current.size !== fileSize || (fileModified !== undefined && current.lastModified !== fileModified)) {
          throw new Error('다른 창에서 일기 파일이 바뀌었습니다. 페이지를 새로 열고 폴더를 다시 연결해 주세요.');
        }
        copy = new SQL.Database(database.export());
        const result = operation(copy);
        writable = await fileHandle.createWritable();
        await writable.write(copy.export());
        await writable.close();
        writable = null;
        const saved = await fileHandle.getFile();
        fileSize = saved.size;
        fileModified = saved.lastModified;
        database.close();
        database = copy;
        copy = null;
        return result;
      } catch (error) {
        if (writable) await writable.abort().catch(() => {});
        throw error;
      } finally {
        copy?.close();
        saving = false;
      }
    }

    if (!existing.size) await commit(() => null);

    return {
      list,
      async create(input) {
        const entry = cleanEntry(input);
        if (!entry) throw new Error('날짜, 제목, 내용을 확인해 주세요.');
        return commit(copy => {
          const now = new Date().toISOString();
          copy.run('INSERT INTO diary_entries (entry_date, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [entry.entryDate, entry.title, entry.body, now, now]);
          const id = rows(copy, 'SELECT last_insert_rowid() AS id')[0].id;
          return rows(copy, `SELECT ${columns} FROM diary_entries WHERE id = ?`, [id])[0];
        });
      },
      async update(id, input) {
        const entry = cleanEntry(input);
        if (!Number.isSafeInteger(id) || id < 1 || !entry) throw new Error('날짜, 제목, 내용을 확인해 주세요.');
        return commit(copy => {
          const now = new Date().toISOString();
          copy.run('UPDATE diary_entries SET entry_date = ?, title = ?, body = ?, updated_at = ? WHERE id = ?', [entry.entryDate, entry.title, entry.body, now, id]);
          if (!rows(copy, 'SELECT changes() AS count')[0].count) throw new Error('일기를 찾을 수 없습니다.');
          return rows(copy, `SELECT ${columns} FROM diary_entries WHERE id = ?`, [id])[0];
        });
      },
      async remove(id) {
        if (!Number.isSafeInteger(id) || id < 1) throw new Error('잘못된 일기 번호입니다.');
        return commit(copy => {
          copy.run('DELETE FROM diary_entries WHERE id = ?', [id]);
          if (!rows(copy, 'SELECT changes() AS count')[0].count) throw new Error('일기를 찾을 수 없습니다.');
          return true;
        });
      },
      close() { database.close(); }
    };
  }

  const api = {open, cleanEntry};
  globalThis.ClassroomDiaryFolderStore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
